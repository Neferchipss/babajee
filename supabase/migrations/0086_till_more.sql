-- 0086: the till, part two (0085 made it). Refunds at the till, sales on
-- account (credit) with collecting what's owed, a record of voided lines
-- and of discounts, who rang each sale up, and the till's reports (Aronium's
-- own list). Online orders are untouched: every new column is empty or false
-- on them, and the refund itself is still admin_refund().
--
-- GST and credit sales: a tax invoice is due when the goods are supplied
-- (CGST Act s.31), paid or not. A counter sale is supplied on the spot, so a
-- sale on account goes through the same path as a paid one: its paid_total
-- is set (the sale is complete and booked) and the invoice is issued at
-- commit by the existing machinery (0051). What the customer still owes is
-- kept apart, per sale: its total, less the payments received, less any
-- refund taken off the account. Collecting it adds payments to those sales.

-- ---------------------------------------------------------------- 1. columns
alter table public.orders
  add column if not exists counter_on_account boolean not null default false,
  add column if not exists counter_cashier uuid references public.profiles (id) on delete set null;
-- who rang up the sales made before this column: the staff member on its first event
update public.orders o
   set counter_cashier = (select e.actor_id from public.order_events e where e.order_id = o.id and e.status = 'pending' order by e.created_at limit 1)
 where o.channel = 'counter' and o.counter_cashier is null;

-- the option's own price when it was sold at the counter, so a discount is
-- known exactly (empty online and before 0086)
alter table public.order_items add column if not exists list_price numeric(10, 2);

-- a customer's credit limit at the counter; empty = the shop's default
alter table public.profiles add column if not exists credit_limit numeric(10, 2);
alter table public.profiles drop constraint if exists profiles_credit_limit_check;
alter table public.profiles add constraint profiles_credit_limit_check check (credit_limit is null or credit_limit >= 0);

alter table public.store_settings
  add column if not exists counter_credit boolean not null default false,
  add column if not exists counter_credit_limit numeric(10, 2);
alter table public.store_settings drop constraint if exists store_settings_counter_credit_check;
alter table public.store_settings add constraint store_settings_counter_credit_check check (counter_credit_limit is null or counter_credit_limit >= 0);

-- ---------------------------------------------------------------- 2. tables
-- how a refund made at the till was paid back (or taken off what's owed)
create table if not exists public.counter_refund_pays (
  refund_id uuid primary key references public.order_refunds (id) on delete cascade,
  method text not null check (length(method) between 1 and 40),
  amount numeric(10, 2) not null check (amount > 0),
  session_id uuid references public.counter_sessions (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
-- money collected against sales on account
create table if not exists public.counter_credit_payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete restrict,
  amount numeric(10, 2) not null check (amount > 0),
  method text not null check (length(method) between 1 and 40),
  reference text not null default '' check (length(reference) <= 80),
  balance_after numeric(10, 2) not null default 0,
  allocations jsonb not null default '[]'::jsonb,
  session_id uuid references public.counter_sessions (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists counter_credit_payments_profile on public.counter_credit_payments (profile_id);
-- lines taken off a ticket, and whole tickets voided, before payment
create table if not exists public.counter_voids (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('line', 'order')),
  variant_id uuid references public.product_variants (id) on delete set null,
  product_name text not null check (length(product_name) <= 200),
  qty int not null check (qty > 0),
  value numeric(10, 2) not null check (value >= 0),
  reason text not null default '' check (length(reason) <= 200),
  session_id uuid references public.counter_sessions (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.counter_refund_pays enable row level security;
alter table public.counter_credit_payments enable row level security;
alter table public.counter_voids enable row level security;
drop policy if exists "staff read till refunds" on public.counter_refund_pays;
create policy "staff read till refunds" on public.counter_refund_pays for select to authenticated using (public.is_admin());
drop policy if exists "staff read credit payments" on public.counter_credit_payments;
create policy "staff read credit payments" on public.counter_credit_payments for select to authenticated using (public.is_admin());
drop policy if exists "staff read voids" on public.counter_voids;
create policy "staff read voids" on public.counter_voids for select to authenticated using (public.is_admin());
revoke all on public.counter_refund_pays, public.counter_credit_payments, public.counter_voids from public, anon, authenticated;
grant select on public.counter_refund_pays, public.counter_credit_payments, public.counter_voids to authenticated;

-- ---------------------------------------------------------------- 3. what's owed
-- one sale: its total, less what was received, less refunds taken off the account
create or replace function public.counter_owed(p_order uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(round(o.total
           - coalesce((select sum(p.amount) from public.payments p where p.order_id = o.id and p.status = 'captured'), 0)
           - coalesce((select sum(c.amount) from public.counter_refund_pays c join public.order_refunds f on f.id = c.refund_id
                        where f.order_id = o.id and lower(c.method) = 'on account'), 0), 2), 0)
    from public.orders o
   where o.id = p_order and o.counter_on_account and o.status <> 'cancelled';
$$;

create or replace function public.customer_balance(p_customer uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(public.counter_owed(o.id)), 0)
    from public.orders o
   where o.profile_id = p_customer and o.counter_on_account and o.status <> 'cancelled' and public.is_admin();
$$;

-- everyone who owes the shop, most first
create or replace function public.counter_balances()
returns table (profile_id uuid, name text, phone text, balance numeric, sales int, oldest timestamptz, credit_limit numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select o.profile_id, max(coalesce(nullif(p.full_name, ''), o.contact_name)), max(coalesce(nullif(p.phone, ''), o.contact_phone)),
         sum(public.counter_owed(o.id)), count(*)::int, min(o.created_at), max(p.credit_limit)
    from public.orders o join public.profiles p on p.id = o.profile_id
   where o.counter_on_account and o.status <> 'cancelled' and public.is_admin()
   group by o.profile_id
  having sum(public.counter_owed(o.id)) > 0
   order by 4 desc;
$$;

create or replace function public.counter_set_credit_limit(p_customer uuid, p_limit numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.staff_can('money') then
    raise exception 'Only owners, admins and the store account set credit limits.' using errcode = '42501';
  end if;
  if p_limit is not null and p_limit < 0 then
    raise exception 'A credit limit can''t be negative.' using errcode = '22023';
  end if;
  update public.profiles set credit_limit = round(p_limit, 2) where id = p_customer;
  if not found then
    raise exception 'That customer no longer exists.' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------- 4. a sale (0085's, plus on account)
-- As 0085, and: a payment {method: "On account", amount} puts that part on
-- the customer's account (Settings › Counter allows it, a customer account is
-- picked, within their credit limit); each line keeps the option's own price
-- (list_price) for the discount reports; the sale records who rang it up.
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
  owe numeric(10, 2) := 0;
  lim numeric;
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
      'sku', v.sku, 'price', price, 'list', nullif(v.price, 0), 'qty', n, 'track', v.track_stock, 'cost', v.cost);
  end loop;

  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'Add how the customer paid.';
  end if;
  if jsonb_array_length(p_payments) > 12 then
    raise exception 'A sale can be split twelve ways at most.';
  end if;
  allowed := case when coalesce(array_length(s.counter_methods, 1), 0) > 0 then s.counter_methods else s.payment_methods end;
  for pay in select * from jsonb_array_elements(p_payments) loop
    amt := round(coalesce(nullif(pay ->> 'amount', '')::numeric, 0), 2);
    if coalesce(btrim(pay ->> 'method'), '') = '' or amt <= 0 then
      raise exception 'Each payment needs a way of paying and an amount.';
    end if;
    if lower(btrim(pay ->> 'method')) = 'on account' then
      owe := owe + amt;
      continue;
    end if;
    if not exists (select 1 from unnest(allowed) a where lower(a) = lower(btrim(pay ->> 'method'))) then
      raise exception '"%" isn''t one of the till''s ways to pay.', btrim(pay ->> 'method') using errcode = '22023';
    end if;
    paid_sum := paid_sum + amt;
    if lower(btrim(pay ->> 'method')) = lower(s.counter_cash_method) then
      cash_sum := cash_sum + amt;
    end if;
  end loop;
  if owe > 0 then
    if not s.counter_credit then
      raise exception 'Sales on account are off (Settings › Counter).' using errcode = '22023';
    end if;
    if p_customer is null then
      raise exception 'Pick the customer''s account to put a sale on account.' using errcode = '22023';
    end if;
    select coalesce(p.credit_limit, s.counter_credit_limit) into lim from public.profiles p where p.id = p_customer;
    if lim is not null and public.customer_balance(p_customer) + owe > lim + 0.005 then
      raise exception 'That takes them over their credit limit of % (they owe % already).',
        to_char(lim, 'FM999999990.00'), to_char(public.customer_balance(p_customer), 'FM999999990.00') using errcode = '22023';
    end if;
  end if;

  insert into public.orders (
    profile_id, contact_name, contact_email, contact_phone,
    address_line1, address_line2, address_landmark, address_city, address_state, address_pincode,
    subtotal, shipping, tax, total, notes, gst_rate, gst_inclusive,
    channel, counter_key, counter_session, counter_on_account, counter_cashier)
  values (
    p_customer,
    coalesce(nullif(btrim(p_contact ->> 'name'), ''), s.counter_walkin_name),
    '',
    left(coalesce(btrim(p_contact ->> 'phone'), ''), 20),
    '', '', '', '', coalesce(s.store_state, ''), '',
    sub, 0, 0, sub, left(coalesce(p_notes, ''), 1000), coalesce(s.gst_rate, 0), coalesce(s.gst_inclusive, true),
    'counter', nullif(btrim(coalesce(p_key, '')), ''), sess, owe > 0, (select auth.uid()))
  returning id, orders.order_number into o_id, o_no;

  update public.order_events set note = 'Sold at the counter', actor_id = (select auth.uid())
   where order_events.order_id = o_id and status = 'pending';

  perform set_config('babajee.stock_reason', 'sale', true);
  perform set_config('babajee.order_id', o_id::text, true);
  for ln in select * from jsonb_array_elements(lines) loop
    insert into public.order_items (order_id, variant_id, product_name, variant_label, sku, unit_price, quantity, list_price)
    values (o_id, (ln ->> 'variant_id')::uuid, ln ->> 'name', ln ->> 'label', ln ->> 'sku', (ln ->> 'price')::numeric, (ln ->> 'qty')::int,
            nullif(ln ->> 'list', '')::numeric)
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

  if paid_sum + owe < tot - 0.005 then
    raise exception 'The payments are % short of the total of %.', to_char(tot - paid_sum - owe, 'FM999999990.00'), to_char(tot, 'FM999999990.00') using errcode = '22023';
  end if;
  over := round(paid_sum + owe - tot, 2);
  if over > 0 and owe > 0 then
    raise exception 'Put only what''s still owed on account: % here is over the total.', to_char(over, 'FM999999990.00') using errcode = '22023';
  end if;
  if over > 0 and cash_sum < over then
    raise exception 'Only cash can be paid over the total (for change). Lower the other payments to the amount due.' using errcode = '22023';
  end if;

  left_over := over;
  for i in reverse jsonb_array_length(p_payments) - 1 .. 0 loop
    pay := p_payments -> i;
    continue when lower(btrim(pay ->> 'method')) = 'on account';
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
  first_method := coalesce(pays -> 0 ->> 'method', 'On account');

  perform set_config('babajee.pay_method', first_method, true);
  perform set_config('babajee.event_note',
    case when owe > 0 then 'Sold at the counter on account: ' || to_char(owe, 'FM999999990.00') || ' owed'
         else 'Sold at the counter: paid and handed over' end, true);
  update public.orders
     set status = 'delivered',
         counter_tendered = case when cash_sum > 0 then cash_sum end,
         counter_change = over
   where id = o_id;
  perform set_config('babajee.event_note', '', true);
  perform set_config('babajee.pay_method', '', true);

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

-- ---------------------------------------------------------------- 5. collecting what's owed
-- Money from a customer against their sales on account, oldest sale first.
-- Returns the payment's id (for its receipt).
create or replace function public.counter_collect(p_customer uuid, p_amount numeric, p_method text, p_reference text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  sess uuid;
  owed numeric;
  left_amt numeric;
  o record;
  take numeric;
  alloc jsonb := '[]'::jsonb;
  id uuid;
  allowed text[];
begin
  if not public.is_admin() then
    raise exception 'Only staff who take orders can collect payments.' using errcode = '42501';
  end if;
  p_amount := round(coalesce(p_amount, 0), 2);
  if p_amount <= 0 then
    raise exception 'Type the amount they''re paying.' using errcode = '22023';
  end if;
  select * into s from public.store_settings st where st.id = 1;
  allowed := case when coalesce(array_length(s.counter_methods, 1), 0) > 0 then s.counter_methods else s.payment_methods end;
  if coalesce(btrim(p_method), '') = '' or not exists (select 1 from unnest(allowed) a where lower(a) = lower(btrim(p_method))) then
    raise exception '"%" isn''t one of the till''s ways to pay.', coalesce(btrim(p_method), '') using errcode = '22023';
  end if;
  owed := public.customer_balance(p_customer);
  if p_amount > owed + 0.005 then
    raise exception 'They owe % in all; collect that or less.', to_char(owed, 'FM999999990.00') using errcode = '22023';
  end if;
  if lower(btrim(p_method)) = lower(s.counter_cash_method) and s.counter_drawer then
    select cs.id into sess from public.counter_sessions cs where cs.closed_at is null;
    if sess is null then
      raise exception 'Open the cash drawer first: this cash goes in it.' using errcode = '22023';
    end if;
  end if;
  left_amt := p_amount;
  for o in select x.id, x.order_number from public.orders x
            where x.profile_id = p_customer and x.counter_on_account and x.status <> 'cancelled'
            order by x.created_at for update loop
    exit when left_amt <= 0;
    take := least(public.counter_owed(o.id), left_amt);
    continue when take <= 0;
    insert into public.payments (order_id, provider, method, reference, amount, status, received_on, recorded_by, note)
    values (o.id, 'credit', btrim(p_method), left(coalesce(btrim(p_reference), ''), 80), take, 'captured',
            (now() at time zone 'Asia/Kolkata')::date, (select auth.uid()), 'Credit payment');
    insert into public.order_events (order_id, status, note, actor_id)
    values (o.id, 'comment', 'Credit payment ' || to_char(take, 'FM999999990.00') || ' by ' || btrim(p_method), (select auth.uid()));
    alloc := alloc || jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'amount', take);
    left_amt := left_amt - take;
  end loop;
  insert into public.counter_credit_payments (profile_id, amount, method, reference, balance_after, allocations, session_id, created_by)
  values (p_customer, p_amount, btrim(p_method), left(coalesce(btrim(p_reference), ''), 80), public.customer_balance(p_customer), alloc, sess, (select auth.uid()))
  returning counter_credit_payments.id into id;
  return id;
end;
$$;

-- ---------------------------------------------------------------- 6. refunds at the till
-- admin_refund() as it is (same checks, credit note at commit, restock),
-- plus how the money went back: a way of paying (cash comes out of the open
-- drawer), or "On account" to take it off what a sale on account still owes.
-- p_lines: [{item, qty}] the order's lines being returned
create or replace function public.counter_refund(
  p_order uuid, p_lines jsonb, p_amount numeric, p_method text, p_restock boolean default true, p_reason text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  sess uuid;
  r_id uuid;
  m text := btrim(coalesce(p_method, ''));
  owed numeric;
  allowed text[];
  items boolean := jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) = 'array' and jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) > 0;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can refund an order.' using errcode = '42501';
  end if;
  select * into s from public.store_settings st where st.id = 1;
  allowed := case when coalesce(array_length(s.counter_methods, 1), 0) > 0 then s.counter_methods else s.payment_methods end;
  if lower(m) = 'on account' then
    owed := coalesce(public.counter_owed(p_order), 0);
    if round(coalesce(p_amount, 0), 2) > owed + 0.005 then
      raise exception 'Only % is still owed on this sale; refund the rest another way.', to_char(owed, 'FM999999990.00') using errcode = '22023';
    end if;
  elsif m = '' or not exists (select 1 from unnest(allowed) a where lower(a) = lower(m)) then
    raise exception 'Pick how the money goes back.' using errcode = '22023';
  end if;
  if lower(m) = lower(s.counter_cash_method) and s.counter_drawer then
    select cs.id into sess from public.counter_sessions cs where cs.closed_at is null;
    if sess is null then
      raise exception 'Open the cash drawer first: this cash comes out of it.' using errcode = '22023';
    end if;
  end if;
  perform public.admin_refund(p_order, coalesce(p_lines, '[]'::jsonb), 0, p_amount, coalesce(p_restock, false) and items, items, p_reason);
  select f.id into r_id from public.order_refunds f where f.order_id = p_order order by f.created_at desc, f.id desc limit 1;
  insert into public.counter_refund_pays (refund_id, method, amount, session_id, created_by)
  values (r_id, case when lower(m) = 'on account' then 'On account' else m end, round(p_amount, 2), sess, (select auth.uid()));
  return r_id;
end;
$$;

-- ---------------------------------------------------------------- 7. voids
-- p_lines: [{variant, name, qty, value}] taken off the ticket before payment
create or replace function public.counter_void(p_kind text, p_lines jsonb, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ln jsonb;
  sess uuid;
begin
  if not public.is_admin() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;
  if p_kind not in ('line', 'order') then
    raise exception 'A void is a line or a whole order.' using errcode = '22023';
  end if;
  select cs.id into sess from public.counter_sessions cs where cs.closed_at is null;
  for ln in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    continue when coalesce((ln ->> 'qty')::int, 0) < 1;
    insert into public.counter_voids (kind, variant_id, product_name, qty, value, reason, session_id, created_by)
    values (p_kind, nullif(ln ->> 'variant', '')::uuid, left(coalesce(ln ->> 'name', ''), 200), (ln ->> 'qty')::int,
            greatest(round(coalesce((ln ->> 'value')::numeric, 0), 2), 0), left(coalesce(btrim(p_reason), ''), 200), sess, (select auth.uid()));
  end loop;
end;
$$;

-- ---------------------------------------------------------------- 8. the drawer's totals, with credit and refunds
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
  ins numeric := 0;
  outs numeric := 0;
  sales int := 0;
  sales_total numeric := 0;
  by_method jsonb := '{}'::jsonb;
  cash_sales numeric := 0;
  on_account numeric := 0;
  collected jsonb := '{}'::jsonb;
  cash_collected numeric := 0;
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
  -- what the session's sales were paid with at the time (not later collections)
  select coalesce(jsonb_object_agg(x.method, x.amount), '{}'::jsonb), coalesce(sum(x.amount) filter (where lower(x.method) = lower(cash)), 0)
    into by_method, cash_sales
    from (select p.method, sum(p.amount) as amount
            from public.payments p join public.orders o on o.id = p.order_id
           where o.counter_session = p_session and p.status = 'captured' and p.provider <> 'credit'
           group by p.method) x;
  select coalesce(sum(o.total - coalesce((select sum(p.amount) from public.payments p where p.order_id = o.id and p.status = 'captured' and p.provider <> 'credit'), 0)), 0)
    into on_account
    from public.orders o where o.counter_session = p_session and o.counter_on_account and o.status <> 'cancelled';
  select coalesce(jsonb_object_agg(x.method, x.amount), '{}'::jsonb), coalesce(sum(x.amount) filter (where lower(x.method) = lower(cash)), 0)
    into collected, cash_collected
    from (select c.method, sum(c.amount) as amount from public.counter_credit_payments c where c.session_id = p_session group by c.method) x;
  -- refunds: the till's own say how the money went; any other refund on a
  -- counter sale while the drawer was open counts as cash when the sale was all cash
  select coalesce(sum(f.amount), 0),
         coalesce(sum(case when rp.refund_id is not null then case when lower(rp.method) = lower(cash) and rp.session_id = p_session then f.amount else 0 end
                           when not exists (select 1 from public.payments p where p.order_id = f.order_id and p.status = 'captured' and lower(p.method) <> lower(cash)) then f.amount
                           else 0 end), 0)
    into refunds, cash_refunds
    from public.order_refunds f
    join public.orders o on o.id = f.order_id
    left join public.counter_refund_pays rp on rp.refund_id = f.id
   where o.channel = 'counter'
     and (rp.session_id = p_session or (rp.refund_id is null and f.created_at >= sess.opened_at and f.created_at < coalesce(sess.closed_at, now())));
  return jsonb_build_object(
    'id', sess.id, 'opened_at', sess.opened_at, 'closed_at', sess.closed_at, 'opened_by', sess.opened_by, 'closed_by', sess.closed_by,
    'opening_float', sess.opening_float, 'cash_in', ins, 'cash_out', outs,
    'sales', sales, 'sales_total', sales_total, 'by_method', by_method, 'on_account', on_account,
    'collected', collected, 'cash_collected', cash_collected,
    'cash_sales', cash_sales, 'refunds', refunds, 'cash_refunds', cash_refunds,
    'expected_cash', round(sess.opening_float + ins - outs + cash_sales + cash_collected - cash_refunds, 2),
    'counted_cash', sess.counted_cash, 'note', sess.note);
end;
$$;

-- ---------------------------------------------------------------- 9. the till's reports
-- the sales the reports count: paid or further, not cancelled, not test,
-- made in [p_a, p_b), on one channel or both, by one cashier or anyone
create or replace function public.till_sales(p_a timestamptz, p_b timestamptz, p_channel text, p_cashier uuid)
returns setof public.orders
language sql
stable
security definer
set search_path = ''
as $$
  select o.* from public.orders o
   where o.created_at >= p_a and o.created_at < p_b and not o.is_test and o.status not in ('pending', 'cancelled')
     and (p_channel = 'all' or o.channel = p_channel)
     and (p_cashier is null or coalesce(o.counter_cashier,
            (select e.actor_id from public.order_events e where e.order_id = o.id and e.status = 'pending' order by e.created_at limit 1)) = p_cashier)
     and public.is_admin();
$$;
revoke all on function public.till_sales(timestamptz, timestamptz, text, uuid) from public, anon;
grant execute on function public.till_sales(timestamptz, timestamptz, text, uuid) to authenticated;

-- Aronium's sales reports, as rows (jsonb objects) for Reporting. Days are
-- India time. p_channel: 'all', 'online' or 'counter' for reports about
-- sales; p_cashier narrows to one staff member where a report has one.
create or replace function public.admin_till_report(p_kind text, p_from date, p_to date, p_channel text default 'all', p_cashier uuid default null)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  b timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
  ch text := coalesce(nullif(p_channel, ''), 'all');
begin
  if not public.staff_can('money') then
    raise exception 'Only owners, admins and the store account see these reports.' using errcode = '42501';
  end if;
  if p_kind = 'daily' then
    return query
      select jsonb_build_object('day', d, 'sales', count(*), 'items', sum(it), 'total', sum(t), 'refunds', sum(rf), 'net', sum(t) - sum(rf))
        from (select (s.created_at at time zone 'Asia/Kolkata')::date as d, s.total as t,
                     (select coalesce(sum(i.quantity), 0) from public.order_items i where i.order_id = s.id) as it,
                     (select coalesce(sum(f.amount), 0) from public.order_refunds f where f.order_id = s.id) as rf
                from public.till_sales(a, b, ch, p_cashier) s) x
       group by d order by d;
  elsif p_kind = 'hourly' then
    return query
      select jsonb_build_object('hour', lpad(h::text, 2, '0') || ':00', 'sales', count(*), 'total', sum(t), 'average', round(avg(t), 2))
        from (select extract(hour from s.created_at at time zone 'Asia/Kolkata')::int as h, s.total as t from public.till_sales(a, b, ch, p_cashier) s) x
       group by h order by h;
  elsif p_kind = 'hourly_groups' then
    return query
      select jsonb_build_object('hour', lpad(h::text, 2, '0') || ':00', 'group', g, 'qty', sum(q), 'total', sum(v))
        from (select extract(hour from s.created_at at time zone 'Asia/Kolkata')::int as h, coalesce(c.name, 'No group') as g,
                     i.quantity as q, i.quantity * i.unit_price as v
                from public.till_sales(a, b, ch, p_cashier) s join public.order_items i on i.order_id = s.id
                left join public.product_variants pv on pv.id = i.variant_id
                left join public.products p on p.id = pv.product_id
                left join public.categories c on c.id = p.category_id) x
       group by h, g order by h, sum(v) desc;
  elsif p_kind in ('pay_types', 'pay_users', 'pay_customers') then
    return query
      select jsonb_build_object('method', coalesce(nullif(x.method, ''), 'Not recorded'), 'who', x.who, 'payments', count(*), 'amount', sum(x.amount))
        from (select p.method, p.amount,
                     case p_kind when 'pay_users' then coalesce(nullif(u.full_name, ''), 'Website')
                                 when 'pay_customers' then s.contact_name else '' end as who
                from public.payments p join public.till_sales(a, b, ch, p_cashier) s on s.id = p.order_id
                left join public.profiles u on u.id = p.recorded_by
               where p.status = 'captured' and p.provider <> 'credit') x
       group by x.method, x.who order by x.who, sum(x.amount) desc;
  elsif p_kind = 'users' then
    return query
      select jsonb_build_object('user', coalesce(nullif(u.full_name, ''), 'Website (the customer)'), 'channel', x.channel, 'sales', count(*), 'total', sum(x.total), 'average', round(avg(x.total), 2))
        from (select s.*, coalesce(s.counter_cashier, (select e.actor_id from public.order_events e where e.order_id = s.id and e.status = 'pending' order by e.created_at limit 1)) as who
                from public.till_sales(a, b, ch, p_cashier) s) x
        left join public.profiles u on u.id = x.who and u.role = 'admin'
       group by u.full_name, x.channel order by sum(x.total) desc;
  elsif p_kind = 'items' then
    return query
      select jsonb_build_object('product', i.product_name, 'option', i.variant_label, 'qty', sum(i.quantity), 'total', sum(i.quantity * i.unit_price),
                                'discount', sum(case when i.list_price is not null and i.list_price > i.unit_price then (i.list_price - i.unit_price) * i.quantity else 0 end))
        from public.till_sales(a, b, ch, p_cashier) s join public.order_items i on i.order_id = s.id
       group by i.product_name, i.variant_label order by sum(i.quantity * i.unit_price) desc;
  elsif p_kind = 'discounts' then
    return query
      select jsonb_build_object('day', (s.created_at at time zone 'Asia/Kolkata')::date, 'order', s.order_number, 'order_id', s.id, 'customer', s.contact_name,
                                'list', sum(i.list_price * i.quantity), 'charged', sum(i.unit_price * i.quantity),
                                'discount', sum((i.list_price - i.unit_price) * i.quantity),
                                'pct', round(sum((i.list_price - i.unit_price) * i.quantity) * 100 / nullif(sum(i.list_price * i.quantity), 0), 2))
        from public.till_sales(a, b, ch, p_cashier) s join public.order_items i on i.order_id = s.id
       where i.list_price is not null and i.list_price > i.unit_price
       group by s.id, s.created_at, s.order_number, s.contact_name order by s.created_at;
  elsif p_kind = 'item_discounts' then
    return query
      select jsonb_build_object('day', (s.created_at at time zone 'Asia/Kolkata')::date, 'order', s.order_number, 'order_id', s.id, 'product', i.product_name, 'option', i.variant_label,
                                'qty', i.quantity, 'list_price', i.list_price, 'price', i.unit_price, 'discount', (i.list_price - i.unit_price) * i.quantity,
                                'pct', round((i.list_price - i.unit_price) * 100 / i.list_price, 2))
        from public.till_sales(a, b, ch, p_cashier) s join public.order_items i on i.order_id = s.id
       where i.list_price is not null and i.list_price > i.unit_price
       order by s.created_at;
  elsif p_kind = 'till_refunds' then
    return query
      select jsonb_build_object('day', (f.created_at at time zone 'Asia/Kolkata')::date, 'order', o.order_number, 'order_id', o.id, 'customer', o.contact_name, 'channel', o.channel,
                                'amount', f.amount, 'method', coalesce(rp.method, 'Not recorded'), 'restocked', f.restocked, 'reason', f.reason, 'by', coalesce(u.full_name, ''))
        from public.order_refunds f join public.orders o on o.id = f.order_id
        left join public.counter_refund_pays rp on rp.refund_id = f.id
        left join public.profiles u on u.id = f.actor_id
       where f.created_at >= a and f.created_at < b and not o.is_test and (ch = 'all' or o.channel = ch)
         and (p_cashier is null or f.actor_id = p_cashier)
       order by f.created_at;
  elsif p_kind = 'unpaid' then
    -- what's owed now, whatever the dates
    return query
      select jsonb_build_object('day', (o.created_at at time zone 'Asia/Kolkata')::date, 'order', o.order_number, 'order_id', o.id, 'customer', o.contact_name,
                                'phone', o.contact_phone, 'total', o.total, 'owed', public.counter_owed(o.id),
                                'days', (now() at time zone 'Asia/Kolkata')::date - (o.created_at at time zone 'Asia/Kolkata')::date)
        from public.orders o
       where o.counter_on_account and o.status <> 'cancelled' and not o.is_test and public.counter_owed(o.id) > 0
         and (p_cashier is null or o.counter_cashier = p_cashier)
       order by o.created_at;
  elsif p_kind = 'collected' then
    return query
      select jsonb_build_object('day', (c.created_at at time zone 'Asia/Kolkata')::date, 'customer', coalesce(nullif(p.full_name, ''), p.phone), 'method', c.method,
                                'reference', c.reference, 'amount', c.amount, 'balance_after', c.balance_after, 'by', coalesce(u.full_name, ''))
        from public.counter_credit_payments c join public.profiles p on p.id = c.profile_id
        left join public.profiles u on u.id = c.created_by
       where c.created_at >= a and c.created_at < b and (p_cashier is null or c.created_by = p_cashier)
       order by c.created_at;
  elsif p_kind = 'floats' then
    return query
      select jsonb_build_object('opened', cs.opened_at, 'by', coalesce(u.full_name, ''), 'float', cs.opening_float, 'closed', cs.closed_at,
                                'expected', cs.expected_cash, 'counted', cs.counted_cash, 'difference', cs.counted_cash - cs.expected_cash, 'note', cs.note)
        from public.counter_sessions cs left join public.profiles u on u.id = cs.opened_by
       where cs.opened_at >= a and cs.opened_at < b and (p_cashier is null or cs.opened_by = p_cashier)
       order by cs.opened_at;
  elsif p_kind = 'cash_moves' then
    return query
      select jsonb_build_object('when', m.created_at, 'kind', case m.kind when 'in' then 'Cash in' else 'Cash out' end, 'amount', m.amount, 'reason', m.reason, 'by', coalesce(u.full_name, ''))
        from public.counter_cash_moves m left join public.profiles u on u.id = m.created_by
       where m.created_at >= a and m.created_at < b and (p_cashier is null or m.created_by = p_cashier)
       order by m.created_at;
  elsif p_kind = 'voids' then
    return query
      select jsonb_build_object('when', v.created_at, 'kind', case v.kind when 'line' then 'Line' else 'Whole order' end, 'product', v.product_name, 'qty', v.qty,
                                'value', v.value, 'reason', v.reason, 'by', coalesce(u.full_name, ''))
        from public.counter_voids v left join public.profiles u on u.id = v.created_by
       where v.created_at >= a and v.created_at < b and (p_cashier is null or v.created_by = p_cashier)
       order by v.created_at;
  else
    raise exception 'No such report: %', p_kind using errcode = '22023';
  end if;
end;
$$;

-- the staff the reports can be narrowed to
create or replace function public.admin_cashiers()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, coalesce(nullif(p.full_name, ''), 'Staff') from public.profiles p
   where p.role = 'admin' and public.is_admin() order by 2;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.counter_owed(uuid)', 'public.customer_balance(uuid)', 'public.counter_balances()', 'public.counter_set_credit_limit(uuid, numeric)',
    'public.counter_collect(uuid, numeric, text, text)', 'public.counter_refund(uuid, jsonb, numeric, text, boolean, text)',
    'public.counter_void(text, jsonb, text)', 'public.counter_totals(uuid)', 'public.admin_till_report(text, date, date, text, uuid)', 'public.admin_cashiers()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
