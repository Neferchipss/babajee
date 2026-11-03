-- Orders that actually happen, and the admin around them.
--
-- 1. Stock: a per-option "track stock" switch (off by default, as on Shopify),
--    and a history row for every change to a stock count.
-- 2. Order numbers count up from BJ-1001.
-- 3. place_order(): checkout. Creates the order and its items from the cart,
--    prices them from the catalogue (never from the browser) and counts
--    tracked stock down. The order starts as "pending" (unpaid); there is no
--    payment step yet.
-- 4. admin_update_order(): every status change (paid, packed, shipped with
--    courier + tracking, delivered, cancelled, refunded), with stock put back
--    on cancel (and on refund if asked).
-- 5. The order timeline (order_events) fills itself from triggers.
-- 6. Visit tracking for the stats page, and the admin's read functions:
--    home counts, analytics, customers.
--
-- Depends on 0001-0012. Safe to re-run.

-- ---------------------------------------------------------------- 1. stock

alter table public.product_variants
  add column if not exists track_stock boolean not null default false;

comment on column public.product_variants.track_stock is
  'On: checkout refuses more than stock_qty and counts it down. Off: always orderable, count untouched.';

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  delta int not null,
  qty_after int not null,
  reason text not null default 'manual' check (reason in ('sale', 'cancel', 'refund', 'manual')),
  order_id uuid references public.orders (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_variant_idx on public.stock_movements (variant_id, created_at desc);
create index if not exists stock_movements_created_idx on public.stock_movements (created_at desc);

alter table public.stock_movements enable row level security;
drop policy if exists "admins read stock movements" on public.stock_movements;
create policy "admins read stock movements" on public.stock_movements
  for select to authenticated using (public.is_admin());
revoke all on public.stock_movements from anon, authenticated;
grant select on public.stock_movements to authenticated;

-- Any change to a stock count, from checkout, an order action or the product
-- editor, leaves a row. The functions below say why through two
-- transaction-local settings; a plain edit is "manual".
create or replace function public.log_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stock_qty is distinct from old.stock_qty then
    insert into public.stock_movements (variant_id, delta, qty_after, reason, order_id, actor_id)
    values (
      new.id,
      new.stock_qty - old.stock_qty,
      new.stock_qty,
      coalesce(nullif(current_setting('babajee.stock_reason', true), ''), 'manual'),
      nullif(current_setting('babajee.order_id', true), '')::uuid,
      (select auth.uid())
    );
  end if;
  return new;
end;
$$;

drop trigger if exists product_variants_log_stock on public.product_variants;
create trigger product_variants_log_stock
  after update of stock_qty on public.product_variants
  for each row execute function public.log_stock_movement();

-- ---------------------------------------------------------------- 2. order numbers

create sequence if not exists public.order_number_seq start 1001;
alter table public.orders
  alter column order_number set default ('BJ-' || nextval('public.order_number_seq'));

-- marks orders made to test the admin, so they are easy to find and remove
alter table public.orders add column if not exists is_test boolean not null default false;
create index if not exists orders_created_idx on public.orders (created_at desc);

-- ---------------------------------------------------------------- 5. timeline triggers

create or replace function public.log_order_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, status, note, actor_id)
    values (new.id, new.status, 'Order placed', (select auth.uid()));
  elsif new.status is distinct from old.status then
    insert into public.order_events (order_id, status, note, actor_id)
    values (new.id, new.status, coalesce(current_setting('babajee.event_note', true), ''), (select auth.uid()));
  end if;
  return new;
end;
$$;

drop trigger if exists orders_log_event on public.orders;
create trigger orders_log_event
  after insert or update of status on public.orders
  for each row execute function public.log_order_event();

-- Status changes go through admin_update_order() only, so stock and the
-- timeline can never be skipped. Comments are still plain inserts.
revoke update on public.orders from authenticated;
grant update (notes) on public.orders to authenticated;

-- ---------------------------------------------------------------- 3. checkout

-- p_items:   [{ "slug": "<product slug>", "variant": "<option label>", "qty": 2 }, ...]
-- p_address: { recipient_name, phone, line1, line2, landmark, city, state,
--              pincode, latitude, longitude }
create or replace function public.place_order(p_items jsonb, p_address jsonb, p_notes text default '')
returns table (order_id uuid, order_number text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := (select auth.uid());
  email text;
  item jsonb;
  v record;
  n int;
  sub numeric(10, 2) := 0;
  ship numeric(10, 2) := 0;
  s record;
  o_id uuid;
  o_no text;
  lines jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'Log in to place an order.' using errcode = '28000';
  end if;
  select u.email into email from auth.users u where u.id = uid;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Too many lines in one order.';
  end if;
  if coalesce(trim(p_address ->> 'recipient_name'), '') = '' or coalesce(trim(p_address ->> 'phone'), '') = ''
     or coalesce(trim(p_address ->> 'line1'), '') = '' or coalesce(trim(p_address ->> 'city'), '') = ''
     or coalesce(trim(p_address ->> 'state'), '') = '' or coalesce(trim(p_address ->> 'pincode'), '') = '' then
    raise exception 'Add a full delivery address.';
  end if;

  -- resolve every line to a visible option, priced from the catalogue, and
  -- lock the stock rows so two checkouts cannot sell the same last item
  for item in select * from jsonb_array_elements(p_items) loop
    n := coalesce((item ->> 'qty')::int, 0);
    if n < 1 or n > 99 then
      raise exception 'Quantities must be between 1 and 99.';
    end if;

    select pv.id, pv.label, pv.sku, pv.price, pv.stock_qty, pv.track_stock, p.name
      into v
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
     where p.slug = item ->> 'slug' and p.is_visible and pv.is_visible
       and (pv.label = coalesce(item ->> 'variant', '')
            or (coalesce(item ->> 'variant', '') in ('', 'Default', 'Standard')
                and (select count(*) from public.product_variants x where x.product_id = p.id and x.is_visible) = 1))
     order by (pv.label = coalesce(item ->> 'variant', '')) desc
     limit 1
     for update of pv;

    if v.id is null then
      raise exception '% is no longer available.', coalesce(item ->> 'slug', 'An item');
    end if;
    if v.price <= 0 then
      raise exception '% has no price yet, so it cannot be ordered.', v.name;
    end if;
    if v.track_stock and v.stock_qty < n then
      if v.stock_qty = 0 then
        raise exception '% is out of stock.', v.name;
      end if;
      raise exception 'Only % left of %.', v.stock_qty, v.name;
    end if;

    sub := sub + v.price * n;
    lines := lines || jsonb_build_object(
      'variant_id', v.id, 'name', v.name, 'label', case when v.label = 'Default' then '' else v.label end,
      'sku', v.sku, 'price', v.price, 'qty', n, 'track', v.track_stock);
  end loop;

  select st.shipping, st.free_shipping_over into s from public.store_settings st where st.id = 1;
  ship := case when s.free_shipping_over is not null and sub >= s.free_shipping_over then 0 else coalesce(s.shipping, 0) end;

  insert into public.orders (
    profile_id, contact_name, contact_email, contact_phone,
    address_line1, address_line2, address_landmark, address_city, address_state, address_pincode,
    address_latitude, address_longitude, subtotal, shipping, tax, total, notes)
  values (
    uid, trim(p_address ->> 'recipient_name'), coalesce(email, ''), trim(p_address ->> 'phone'),
    trim(p_address ->> 'line1'), coalesce(trim(p_address ->> 'line2'), ''), coalesce(trim(p_address ->> 'landmark'), ''),
    trim(p_address ->> 'city'), trim(p_address ->> 'state'), trim(p_address ->> 'pincode'),
    nullif(p_address ->> 'latitude', '')::double precision, nullif(p_address ->> 'longitude', '')::double precision,
    sub, ship, 0, sub + ship, left(coalesce(p_notes, ''), 1000))
  returning id, orders.order_number into o_id, o_no;

  perform set_config('babajee.stock_reason', 'sale', true);
  perform set_config('babajee.order_id', o_id::text, true);
  for item in select * from jsonb_array_elements(lines) loop
    insert into public.order_items (order_id, variant_id, product_name, variant_label, sku, unit_price, quantity)
    values (o_id, (item ->> 'variant_id')::uuid, item ->> 'name', item ->> 'label', item ->> 'sku',
            (item ->> 'price')::numeric, (item ->> 'qty')::int);
    if (item ->> 'track')::boolean then
      update public.product_variants set stock_qty = stock_qty - (item ->> 'qty')::int
       where id = (item ->> 'variant_id')::uuid;
    end if;
  end loop;
  perform set_config('babajee.stock_reason', '', true);
  perform set_config('babajee.order_id', '', true);

  return query select o_id, o_no;
end;
$$;

revoke all on function public.place_order(jsonb, jsonb, text) from public, anon;
grant execute on function public.place_order(jsonb, jsonb, text) to authenticated;

-- ---------------------------------------------------------------- 4. order actions

-- Forward along pending > paid > packed > shipped > delivered (steps may be
-- skipped, never undone). Cancel before shipping; refund once paid.
-- Cancelling always puts tracked stock back; a refund does when p_restock.
create or replace function public.admin_update_order(
  p_order uuid,
  p_status text,
  p_note text default '',
  p_carrier text default null,
  p_tracking text default null,
  p_restock boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur text;
  steps text[] := array['pending', 'paid', 'packed', 'shipped', 'delivered'];
  note text := coalesce(trim(p_note), '');
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change an order.' using errcode = '42501';
  end if;
  select status into cur from public.orders where id = p_order for update;
  if cur is null then
    raise exception 'Order not found.';
  end if;
  if cur in ('cancelled', 'refunded') then
    raise exception 'This order is already %.', cur;
  end if;

  if p_status = 'cancelled' then
    if cur in ('shipped', 'delivered') then
      raise exception 'A shipped order cannot be cancelled. Refund it instead.';
    end if;
  elsif p_status = 'refunded' then
    if cur = 'pending' then
      raise exception 'Nothing was paid yet. Cancel the order instead.';
    end if;
  elsif array_position(steps, p_status) is null then
    raise exception 'Unknown status %.', p_status;
  elsif array_position(steps, p_status) <= array_position(steps, cur) then
    raise exception 'The order is already %.', cur;
  end if;

  if p_status = 'shipped' then
    insert into public.shipments (order_id, carrier, tracking_number, shipped_at)
    values (p_order, nullif(trim(p_carrier), ''), nullif(trim(p_tracking), ''), now());
    if note = '' then
      note := concat_ws(' · ', nullif(trim(p_carrier), ''), nullif(trim(p_tracking), ''));
    end if;
  elsif p_status = 'delivered' then
    update public.shipments set delivered_at = now() where order_id = p_order and delivered_at is null;
  end if;

  if p_status = 'cancelled' or (p_status = 'refunded' and p_restock) then
    perform set_config('babajee.stock_reason', case when p_status = 'cancelled' then 'cancel' else 'refund' end, true);
    perform set_config('babajee.order_id', p_order::text, true);
    update public.product_variants pv
       set stock_qty = pv.stock_qty + oi.qty
      from (select variant_id, sum(quantity)::int qty from public.order_items
             where order_id = p_order and variant_id is not null group by variant_id) oi
     where pv.id = oi.variant_id and pv.track_stock;
    if p_status = 'refunded' and note = '' then
      note := 'Items restocked';
    end if;
  end if;

  perform set_config('babajee.event_note', note, true);
  update public.orders set status = p_status where id = p_order;
  perform set_config('babajee.event_note', '', true);
  perform set_config('babajee.stock_reason', '', true);
  perform set_config('babajee.order_id', '', true);
end;
$$;

revoke all on function public.admin_update_order(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_update_order(uuid, text, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------- 6a. visits

-- One row per page view or shop step, keyed by a random id the browser keeps
-- for the visit (no account, no IP address). Written only through
-- track_event(); read only by admins.
create table if not exists public.site_events (
  id bigint generated always as identity primary key,
  session_id text not null,
  kind text not null check (kind in ('view', 'cart', 'checkout')),
  path text not null default '',
  referrer text not null default '',
  device text not null default '' check (device in ('', 'mobile', 'tablet', 'desktop')),
  created_at timestamptz not null default now()
);

create index if not exists site_events_created_idx on public.site_events (created_at);

alter table public.site_events enable row level security;
drop policy if exists "admins read site events" on public.site_events;
create policy "admins read site events" on public.site_events
  for select to authenticated using (public.is_admin());
revoke all on public.site_events from anon, authenticated;
grant select on public.site_events to authenticated;

create or replace function public.track_event(p_session text, p_kind text, p_path text, p_referrer text, p_device text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.site_events (session_id, kind, path, referrer, device)
  select left(p_session, 64), p_kind, left(coalesce(p_path, ''), 200), left(coalesce(p_referrer, ''), 120),
         case when p_device in ('mobile', 'tablet', 'desktop') then p_device else '' end
  where p_kind in ('view', 'cart', 'checkout') and length(coalesce(p_session, '')) between 8 and 64;
$$;

revoke all on function public.track_event(text, text, text, text, text) from public;
grant execute on function public.track_event(text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- 6b. admin reads

-- Home's "things to do" counts.
create or replace function public.admin_home_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'unpaid', (select count(*) from public.orders where status = 'pending'),
    'to_pack', (select count(*) from public.orders where status = 'paid'),
    'to_ship', (select count(*) from public.orders where status = 'packed'),
    'in_transit', (select count(*) from public.orders where status = 'shipped'),
    'out_of_stock', (select count(*) from public.product_variants where track_stock and is_visible and stock_qty = 0),
    'low_stock', (select count(*) from public.product_variants where track_stock and is_visible and stock_qty between 1 and 3),
    'unpriced', (select count(*) from public.product_variants where is_visible and price = 0)
  );
end;
$$;

-- Everything the Analytics page shows for one date range (inclusive, India
-- time). Sales count every order that was not cancelled, from the moment it
-- is placed (as Shopify does); refunds are taken off as returns.
create or replace function public.admin_analytics(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t0 timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  t1 timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  with o as (
    select * from public.orders where created_at >= t0 and created_at < t1 and status <> 'cancelled'
  ),
  days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  ),
  daily as (
    select days.day,
           coalesce(sum(o.subtotal), 0) as gross,
           count(o.id) as orders
      from days left join o on (o.created_at at time zone 'Asia/Kolkata')::date = days.day
     group by days.day
  ),
  buyers as (
    select o.profile_id,
           exists (select 1 from public.orders p
                    where p.profile_id = o.profile_id and p.created_at < t0 and p.status <> 'cancelled') as before,
           count(*) as n
      from o where o.profile_id is not null group by o.profile_id
  ),
  ev as (
    select * from public.site_events where created_at >= t0 and created_at < t1
  )
  select jsonb_build_object(
    'orders', (select count(*) from o),
    'items', (select coalesce(sum(i.quantity), 0) from public.order_items i join o on o.id = i.order_id),
    'gross', (select coalesce(sum(subtotal), 0) from o),
    'returns', (select coalesce(sum(subtotal), 0) from o where status = 'refunded'),
    'shipping', (select coalesce(sum(shipping), 0) from o where status <> 'refunded'),
    'tax', (select coalesce(sum(tax), 0) from o where status <> 'refunded'),
    'fulfilled', (select count(*) from o where status in ('shipped', 'delivered')),
    'customers', (select count(*) from buyers),
    'returning', (select count(*) from buyers where before or n > 1),
    'cancelled', (select count(*) from public.orders where created_at >= t0 and created_at < t1 and status = 'cancelled'),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'gross', gross, 'orders', orders) order by day), '[]') from daily),
    'top_products', (
      select coalesce(jsonb_agg(x), '[]') from (
        select i.product_name as name, sum(i.quantity) as qty, sum(i.quantity * i.unit_price) as sales
          from public.order_items i join o on o.id = i.order_id
         where o.status <> 'refunded'
         group by i.product_name order by sales desc limit 8) x),
    'by_state', (
      select coalesce(jsonb_agg(x), '[]') from (
        select address_state as name, count(*) as orders, sum(subtotal) as sales
          from o group by address_state order by sales desc limit 6) x),
    'sessions', (select count(distinct session_id) from ev),
    'views', (select count(*) from ev where kind = 'view'),
    'cart_sessions', (select count(distinct session_id) from ev where kind = 'cart'),
    'checkout_sessions', (select count(distinct session_id) from ev where kind = 'checkout'),
    'daily_sessions', (
      select coalesce(jsonb_agg(jsonb_build_object('day', days.day, 'sessions', coalesce(x.n, 0)) order by days.day), '[]')
        from days left join (
          select (created_at at time zone 'Asia/Kolkata')::date as day, count(distinct session_id) as n
            from ev group by 1) x on x.day = days.day),
    'devices', (
      select coalesce(jsonb_agg(x), '[]') from (
        select coalesce(nullif(device, ''), 'unknown') as name, count(distinct session_id) as sessions
          from ev group by 1 order by 2 desc) x),
    'referrers', (
      select coalesce(jsonb_agg(x), '[]') from (
        select coalesce(nullif(referrer, ''), 'Direct') as name, count(distinct session_id) as sessions
          from ev where kind = 'view' group by 1 order by 2 desc limit 6) x),
    'pages', (
      select coalesce(jsonb_agg(x), '[]') from (
        select path as name, count(*) as views from ev where kind = 'view' group by 1 order by 2 desc limit 6) x)
  ) into r;
  return r;
end;
$$;

-- Customers with their order totals. Email lives in auth.users, which only a
-- definer function can read.
create or replace function public.admin_customers()
returns table (id uuid, full_name text, phone text, email text, joined timestamptz,
               orders bigint, spent numeric, last_order timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.phone, u.email::text, p.created_at,
           count(o.id), coalesce(sum(o.total) filter (where o.status not in ('cancelled', 'refunded')), 0),
           max(o.created_at)
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.orders o on o.profile_id = p.id
     where p.role = 'customer'
     group by p.id, u.email
     order by max(o.created_at) desc nulls last, p.created_at desc;
end;
$$;

revoke all on function public.admin_home_counts() from public, anon;
revoke all on function public.admin_analytics(date, date) from public, anon;
revoke all on function public.admin_customers() from public, anon;
grant execute on function public.admin_home_counts() to authenticated;
grant execute on function public.admin_analytics(date, date) to authenticated;
grant execute on function public.admin_customers() to authenticated;

-- Verify:
--   select proname from pg_proc where proname in ('place_order','admin_update_order','admin_analytics',
--     'admin_customers','admin_home_counts','track_event','log_order_event','log_stock_movement');  -- 8 rows
--   select tgname from pg_trigger where tgname in ('orders_log_event','product_variants_log_stock');  -- 2 rows
