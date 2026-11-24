-- 0085: the counter till. A walk-in sale rung up at the shop's counter is an
-- ordinary order marked channel = 'counter': no address or delivery, paid
-- (cash, UPI, card, split between them) and handed over on the spot, so it
-- goes straight to delivered. Stock comes off and the GST invoice is issued
-- exactly as for any paid order. Online orders are untouched: every existing
-- and new row defaults to channel 'online', and checkout and the admin's own
-- order functions don't change.
--
-- With the cash drawer switched on (store_settings.counter_drawer), a sale
-- belongs to the open drawer session: opened with a float, cash paid in and
-- out with a reason, then counted and closed with an end-of-day (Z) report.
-- The till's choices (which payment methods, discounts, price changes,
-- selling with no stock, the receipt) are store_settings.counter_* columns.

-- ---------------------------------------------------------------- 1. settings
alter table public.store_settings
  add column if not exists counter_drawer boolean not null default true,
  add column if not exists counter_methods text[] not null default '{}',
  add column if not exists counter_cash_method text not null default 'Cash',
  add column if not exists counter_discounts boolean not null default true,
  add column if not exists counter_max_discount numeric(5, 2) not null default 100,
  add column if not exists counter_price_change boolean not null default true,
  add column if not exists counter_negative_stock boolean not null default false,
  add column if not exists counter_auto_print boolean not null default true,
  add column if not exists counter_receipt_size text not null default '80mm',
  add column if not exists counter_receipt_header text not null default '',
  add column if not exists counter_receipt_footer text not null default 'Thank you! Please visit again.',
  add column if not exists counter_receipt_gstin boolean not null default true,
  add column if not exists counter_float numeric(10, 2) not null default 0,
  add column if not exists counter_walkin_name text not null default 'Walk-in customer';

alter table public.store_settings drop constraint if exists store_settings_counter_check;
alter table public.store_settings add constraint store_settings_counter_check check (
  counter_max_discount between 0 and 100
  and counter_receipt_size in ('58mm', '80mm', 'A4')
  and length(counter_receipt_header) <= 300 and length(counter_receipt_footer) <= 300
  and length(counter_cash_method) <= 40 and counter_float >= 0
  and length(counter_walkin_name) between 1 and 60
  and coalesce(array_length(counter_methods, 1), 0) <= 12);

-- ---------------------------------------------------------------- 2. drawer
create table if not exists public.counter_sessions (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid references public.profiles (id) on delete set null,
  opened_at timestamptz not null default now(),
  opening_float numeric(10, 2) not null default 0 check (opening_float >= 0),
  closed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  counted_cash numeric(10, 2) check (counted_cash is null or counted_cash >= 0),
  expected_cash numeric(10, 2),
  note text not null default '' check (length(note) <= 500)
);
-- one counter, one drawer open at a time
create unique index if not exists counter_sessions_one_open on public.counter_sessions ((true)) where closed_at is null;

create table if not exists public.counter_cash_moves (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.counter_sessions (id) on delete cascade,
  kind text not null check (kind in ('in', 'out')),
  amount numeric(10, 2) not null check (amount > 0),
  reason text not null default '' check (length(reason) <= 200),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists counter_cash_moves_session on public.counter_cash_moves (session_id);

alter table public.counter_sessions enable row level security;
alter table public.counter_cash_moves enable row level security;
drop policy if exists "staff read drawer sessions" on public.counter_sessions;
create policy "staff read drawer sessions" on public.counter_sessions for select to authenticated using (public.is_admin());
drop policy if exists "staff read drawer moves" on public.counter_cash_moves;
create policy "staff read drawer moves" on public.counter_cash_moves for select to authenticated using (public.is_admin());
revoke all on public.counter_sessions, public.counter_cash_moves from public, anon, authenticated;
grant select on public.counter_sessions, public.counter_cash_moves to authenticated;

-- ---------------------------------------------------------------- 3. orders
alter table public.orders
  add column if not exists channel text not null default 'online',
  add column if not exists counter_key text,
  add column if not exists counter_session uuid references public.counter_sessions (id) on delete set null,
  add column if not exists counter_tendered numeric(10, 2),
  add column if not exists counter_change numeric(10, 2);
alter table public.orders drop constraint if exists orders_channel_check;
alter table public.orders add constraint orders_channel_check check (channel in ('online', 'counter'));
-- the till sends a key with each sale so a double tap can't ring it up twice
create unique index if not exists orders_counter_key on public.orders (counter_key) where counter_key is not null;
create index if not exists orders_counter_session on public.orders (counter_session) where counter_session is not null;

-- ---------------------------------------------------------------- 4. a sale
-- p_lines:    [{variant, qty, price?}]  price = the price charged per piece,
--             after any discount; left out = the option's own price
-- p_payments: [{method, amount, reference?}]  more than one splits the bill;
--             what's paid over the total must be in cash, and is the change
create or replace function public.counter_sale(
  p_lines jsonb,
  p_payments jsonb,
  p_customer uuid default null,
  p_contact jsonb default '{}'::jsonb,
  p_gstin text default '',
  p_notes text default '',
  p_key text default null)
returns table (order_id uuid, order_number text, change numeric)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  s record;
  sess uuid;
  ln jsonb;
  v record;
  n int;
  price numeric(10, 2);
  sub numeric(10, 2) := 0;
  lines jsonb := '[]'::jsonb;
  o_id uuid;
  o_no text;
  oi_id uuid;
  tot numeric(10, 2);
  allowed text[];
  pay jsonb;
  pays jsonb := '[]'::jsonb;
  paid_sum numeric(10, 2) := 0;
  cash_sum numeric(10, 2) := 0;
  over numeric(10, 2);
  left_over numeric(10, 2);
  amt numeric(10, 2);
  g text := upper(btrim(coalesce(p_gstin, '')));
  first_method text;
  i int;
begin
  if not public.is_admin() then
    raise exception 'Only staff who take orders can use the till.' using errcode = '42501';
  end if;
  -- the same sale sent twice (a double tap, a retry): give back the first
  if p_key is not null and btrim(p_key) <> '' then
    select o.id, o.order_number, coalesce(o.counter_change, 0) into o_id, o_no, amt
      from public.orders o where o.counter_key = p_key;
    if found then
      return query select o_id, o_no, amt;
      return;
    end if;
  end if;

  select * into s from public.store_settings st where st.id = 1;
  if s.counter_drawer then
    select cs.id into sess from public.counter_sessions cs where cs.closed_at is null;
    if sess is null then
      raise exception 'Open the cash drawer first (Cash drawer › Open), then ring up the sale.' using errcode = '22023';
    end if;
  end if;
  if p_customer is not null and not exists (select 1 from public.profiles where id = p_customer) then
    raise exception 'That customer no longer exists.';
  end if;
  if g <> '' and g !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'That GSTIN doesn''t look right: it''s 15 characters, like 27ABCDE1234F1Z5.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item.';
  end if;
  if jsonb_array_length(p_lines) > 100 then
    raise exception 'Too many lines in one sale.';
  end if;

  for ln in select * from jsonb_array_elements(p_lines) loop
    n := coalesce((ln ->> 'qty')::int, 0);
    if n < 1 or n > 999 then
      raise exception 'Quantities must be between 1 and 999.';
    end if;
    select pv.id, pv.label, pv.sku, pv.price, pv.stock_qty, pv.track_stock, p.name,
           (select vc.cost from public.variant_costs vc where vc.variant_id = pv.id) as cost
      into v
      from public.product_variants pv join public.products p on p.id = pv.product_id
     where pv.id = (ln ->> 'variant')::uuid
       for update of pv;
    if v.id is null then
      raise exception 'A product in this sale no longer exists.';
    end if;
    price := round(coalesce(nullif(ln ->> 'price', '')::numeric, v.price), 2);
    if price is null or price <= 0 then
      raise exception '% has no price. Type one for this sale.', v.name;
    end if;
    -- the till's own rules on prices (store_settings.counter_*)
    if coalesce(v.price, 0) > 0 and price <> v.price then
      if not s.counter_price_change and not (s.counter_discounts and price < v.price) then
        raise exception 'Prices can''t be changed at the counter (Settings › Counter).' using errcode = '22023';
      end if;
      if price < v.price and not s.counter_price_change
         and (v.price - price) * 100 / v.price > s.counter_max_discount + 0.005 then
        raise exception 'The discount on % is more than the % allowed at the counter.', v.name, s.counter_max_discount || '%' using errcode = '22023';
      end if;
    end if;
    if v.track_stock and v.stock_qty < n and not s.counter_negative_stock then
      raise exception 'Only % of % in stock.', v.stock_qty, v.name;
    end if;
    sub := sub + price * n;
    lines := lines || jsonb_build_object(
      'variant_id', v.id, 'name', v.name, 'label', case when v.label = 'Default' then '' else v.label end,
      'sku', v.sku, 'price', price, 'qty', n, 'track', v.track_stock, 'cost', v.cost);
  end loop;

  -- the payments, checked before anything is written
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'Add how the customer paid.';
  end if;
  if jsonb_array_length(p_payments) > 6 then
    raise exception 'A sale can be split six ways at most.';
  end if;
  allowed := case when coalesce(array_length(s.counter_methods, 1), 0) > 0 then s.counter_methods else s.payment_methods end;
  for pay in select * from jsonb_array_elements(p_payments) loop
    amt := round(coalesce(nullif(pay ->> 'amount', '')::numeric, 0), 2);
    if coalesce(btrim(pay ->> 'method'), '') = '' or amt <= 0 then
      raise exception 'Each payment needs a way of paying and an amount.';
    end if;
    if not exists (select 1 from unnest(allowed) a where lower(a) = lower(btrim(pay ->> 'method'))) then
      raise exception '"%" isn''t one of the till''s ways to pay.', btrim(pay ->> 'method') using errcode = '22023';
    end if;
    paid_sum := paid_sum + amt;
    if lower(btrim(pay ->> 'method')) = lower(s.counter_cash_method) then
      cash_sum := cash_sum + amt;
    end if;
  end loop;

  insert into public.orders (
    profile_id, contact_name, contact_email, contact_phone,
    address_line1, address_line2, address_landmark, address_city, address_state, address_pincode,
    subtotal, shipping, tax, total, notes, gst_rate, gst_inclusive,
    channel, counter_key, counter_session)
  values (
    p_customer,
    coalesce(nullif(btrim(p_contact ->> 'name'), ''), s.counter_walkin_name),
    '',
    left(coalesce(btrim(p_contact ->> 'phone'), ''), 20),
    -- sold at the shop: the place of supply is the shop's own state
    '', '', '', '', coalesce(s.store_state, ''), '',
    sub, 0, 0, sub, left(coalesce(p_notes, ''), 1000), coalesce(s.gst_rate, 0), coalesce(s.gst_inclusive, true),
    'counter', nullif(btrim(coalesce(p_key, '')), ''), sess)
  returning id, orders.order_number into o_id, o_no;

  update public.order_events set note = 'Sold at the counter', actor_id = (select auth.uid())
   where order_events.order_id = o_id and status = 'pending';

  perform set_config('babajee.stock_reason', 'sale', true);
  perform set_config('babajee.order_id', o_id::text, true);
  for ln in select * from jsonb_array_elements(lines) loop
    insert into public.order_items (order_id, variant_id, product_name, variant_label, sku, unit_price, quantity)
    values (o_id, (ln ->> 'variant_id')::uuid, ln ->> 'name', ln ->> 'label', ln ->> 'sku', (ln ->> 'price')::numeric, (ln ->> 'qty')::int)
    returning id into oi_id;
    if ln ->> 'cost' is not null then
      insert into public.order_item_costs (order_item_id, unit_cost) values (oi_id, (ln ->> 'cost')::numeric);
    end if;
    if (ln ->> 'track')::boolean then
      update public.product_variants set stock_qty = stock_qty - (ln ->> 'qty')::int where id = (ln ->> 'variant_id')::uuid;
    end if;
  end loop;
  perform set_config('babajee.stock_reason', '', true);
  perform set_config('babajee.order_id', '', true);

  perform public.order_retax(o_id);
  if g <> '' then
    update public.orders set buyer_gstin = g where id = o_id;
  end if;
  select o.total into tot from public.orders o where o.id = o_id;

  -- paid in full; anything over is change, and only cash can give change
  if paid_sum < tot - 0.005 then
    raise exception 'The payments are % short of the total of %.', to_char(tot - paid_sum, 'FM999999990.00'), to_char(tot, 'FM999999990.00') using errcode = '22023';
  end if;
  over := round(paid_sum - tot, 2);
  if over > 0 and cash_sum < over then
    raise exception 'Only cash can be paid over the total (for change). Lower the other payments to the amount due.' using errcode = '22023';
  end if;

  -- the payments as they stand once the change is taken out of the cash
  left_over := over;
  for i in reverse jsonb_array_length(p_payments) - 1 .. 0 loop
    pay := p_payments -> i;
    amt := round((pay ->> 'amount')::numeric, 2);
    if left_over > 0 and lower(btrim(pay ->> 'method')) = lower(s.counter_cash_method) then
      if amt <= left_over then
        left_over := left_over - amt;
        amt := 0;
      else
        amt := amt - left_over;
        left_over := 0;
      end if;
    end if;
    if amt > 0 then
      pays := jsonb_build_array(jsonb_build_object('method', btrim(pay ->> 'method'), 'amount', amt, 'reference', left(coalesce(btrim(pay ->> 'reference'), ''), 80))) || pays;
    end if;
  end loop;
  first_method := pays -> 0 ->> 'method';

  -- paid and handed over, through the status triggers so paid_total, the
  -- timeline and the invoice (at commit) follow as for any paid order
  perform set_config('babajee.pay_method', coalesce(first_method, ''), true);
  perform set_config('babajee.event_note', 'Sold at the counter: paid and handed over', true);
  update public.orders
     set status = 'delivered',
         counter_tendered = case when cash_sum > 0 then cash_sum end,
         counter_change = over
   where id = o_id;
  perform set_config('babajee.event_note', '', true);
  perform set_config('babajee.pay_method', '', true);

  -- one payment row per way it was paid, in place of the single one the
  -- trigger wrote
  delete from public.payments where payments.order_id = o_id;
  for pay in select * from jsonb_array_elements(pays) loop
    insert into public.payments (order_id, provider, method, reference, amount, status, received_on, recorded_by, note)
    values (o_id, 'manual', pay ->> 'method', pay ->> 'reference', (pay ->> 'amount')::numeric, 'captured',
            (now() at time zone 'Asia/Kolkata')::date, (select auth.uid()),
            case when over > 0 and lower(pay ->> 'method') = lower(s.counter_cash_method)
                 then 'Counter: tendered ' || to_char(cash_sum, 'FM999999990.00') || ', change ' || to_char(over, 'FM999999990.00')
                 else 'Counter sale' end);
  end loop;

  return query select o_id, o_no, over;
end;
$$;
revoke all on function public.counter_sale(jsonb, jsonb, uuid, jsonb, text, text, text) from public, anon;
grant execute on function public.counter_sale(jsonb, jsonb, uuid, jsonb, text, text, text) to authenticated;

-- ---------------------------------------------------------------- 5. the drawer
create or replace function public.counter_open(p_float numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  id uuid;
  since timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Only staff who take orders can open the drawer.' using errcode = '42501';
  end if;
  select cs.opened_at into since from public.counter_sessions cs where cs.closed_at is null;
  if found then
    raise exception 'The drawer is already open (since %).', to_char(since at time zone 'Asia/Kolkata', 'DD Mon HH12:MI am') using errcode = '22023';
  end if;
  if p_float is null or p_float < 0 then
    raise exception 'The float can''t be negative.' using errcode = '22023';
  end if;
  insert into public.counter_sessions (opened_by, opening_float) values ((select auth.uid()), round(p_float, 2)) returning counter_sessions.id into id;
  return id;
end;
$$;

create or replace function public.counter_cash(p_kind text, p_amount numeric, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sess uuid;
begin
  if not public.is_admin() then
    raise exception 'Only staff who take orders can move cash.' using errcode = '42501';
  end if;
  if p_kind not in ('in', 'out') then
    raise exception 'Cash goes in or out.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Type an amount above zero.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why the cash went % (a reason).', p_kind using errcode = '22023';
  end if;
  select cs.id into sess from public.counter_sessions cs where cs.closed_at is null;
  if sess is null then
    raise exception 'The drawer isn''t open.' using errcode = '22023';
  end if;
  insert into public.counter_cash_moves (session_id, kind, amount, reason, created_by)
  values (sess, p_kind, round(p_amount, 2), left(btrim(p_reason), 200), (select auth.uid()));
end;
$$;

-- what one session took: the float, cash in and out, sales by way of paying,
-- refunds on counter sales made while it was open (a refund on a sale paid
-- all in cash is counted as cash handed back), and the cash that should be
-- in the drawer
create or replace function public.counter_totals(p_session uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sess record;
  cash text;
  r jsonb;
  ins numeric := 0;
  outs numeric := 0;
  sales int := 0;
  sales_total numeric := 0;
  by_method jsonb := '{}'::jsonb;
  cash_sales numeric := 0;
  refunds numeric := 0;
  cash_refunds numeric := 0;
begin
  if not public.is_admin() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;
  select * into sess from public.counter_sessions cs where cs.id = p_session;
  if not found then
    raise exception 'That drawer session doesn''t exist.' using errcode = 'P0002';
  end if;
  select st.counter_cash_method into cash from public.store_settings st where st.id = 1;
  select coalesce(sum(m.amount) filter (where m.kind = 'in'), 0), coalesce(sum(m.amount) filter (where m.kind = 'out'), 0)
    into ins, outs from public.counter_cash_moves m where m.session_id = p_session;
  select count(*), coalesce(sum(o.total), 0) into sales, sales_total
    from public.orders o where o.counter_session = p_session and o.status <> 'cancelled';
  select coalesce(jsonb_object_agg(x.method, x.amount), '{}'::jsonb), coalesce(sum(x.amount) filter (where lower(x.method) = lower(cash)), 0)
    into by_method, cash_sales
    from (select p.method, sum(p.amount) as amount
            from public.payments p join public.orders o on o.id = p.order_id
           where o.counter_session = p_session and p.status = 'captured'
           group by p.method) x;
  select coalesce(sum(f.amount), 0),
         coalesce(sum(f.amount) filter (where not exists (
           select 1 from public.payments p where p.order_id = f.order_id and p.status = 'captured' and lower(p.method) <> lower(cash))), 0)
    into refunds, cash_refunds
    from public.order_refunds f join public.orders o on o.id = f.order_id
   where o.channel = 'counter' and f.created_at >= sess.opened_at and f.created_at < coalesce(sess.closed_at, now());
  r := jsonb_build_object(
    'id', sess.id, 'opened_at', sess.opened_at, 'closed_at', sess.closed_at, 'opened_by', sess.opened_by, 'closed_by', sess.closed_by,
    'opening_float', sess.opening_float, 'cash_in', ins, 'cash_out', outs,
    'sales', sales, 'sales_total', sales_total, 'by_method', by_method,
    'cash_sales', cash_sales, 'refunds', refunds, 'cash_refunds', cash_refunds,
    'expected_cash', round(sess.opening_float + ins - outs + cash_sales - cash_refunds, 2),
    'counted_cash', sess.counted_cash, 'note', sess.note);
  return r;
end;
$$;

create or replace function public.counter_close(p_counted numeric, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sess uuid;
  t jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only staff who take orders can close the drawer.' using errcode = '42501';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'Type the cash counted in the drawer.' using errcode = '22023';
  end if;
  select cs.id into sess from public.counter_sessions cs where cs.closed_at is null for update;
  if sess is null then
    raise exception 'The drawer isn''t open.' using errcode = '22023';
  end if;
  t := public.counter_totals(sess);
  update public.counter_sessions
     set closed_at = now(), closed_by = (select auth.uid()), counted_cash = round(p_counted, 2),
         expected_cash = (t ->> 'expected_cash')::numeric, note = left(coalesce(p_note, ''), 500)
   where id = sess;
  return public.counter_totals(sess);
end;
$$;

revoke all on function public.counter_open(numeric) from public, anon;
revoke all on function public.counter_cash(text, numeric, text) from public, anon;
revoke all on function public.counter_totals(uuid) from public, anon;
revoke all on function public.counter_close(numeric, text) from public, anon;
grant execute on function public.counter_open(numeric) to authenticated;
grant execute on function public.counter_cash(text, numeric, text) to authenticated;
grant execute on function public.counter_totals(uuid) to authenticated;
grant execute on function public.counter_close(numeric, text) to authenticated;
