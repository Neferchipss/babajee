-- Cost price, GST and profit.
--
-- 1. GST is a checkout matter: one rate on the whole cart, set in Settings,
--    with a switch for whether shelf prices already include it ("inclusive")
--    or it is added on top. Each order keeps the rate and mode it was placed
--    under, so changing the setting never rewrites old bills.
-- 2. Each option has a cost price (what the shop pays the supplier). Product
--    options are readable by anyone, so the cost lives in its own admin-only
--    table. Each order line keeps the cost it sold at, also admin-only.
-- 3. gst_input_credit: whether the shop claims back the GST on supplier
--    bills. When on, that GST is taken out of the cost and set against the
--    GST collected. It is read at report time (not frozen per order), so it
--    can be flipped once the client's accountant confirms.
-- 4. admin_profit(from, to): sales after GST, cost, profit, margin, GST
--    collected / paid / to pay, and profit per day, for the Analytics page.
--    Shipping is left out of profit (the courier's cost isn't recorded).
--    A line sold before its cost was entered falls back to today's cost.
--
-- Depends on 0013. Safe to re-run.

-- ---------------------------------------------------------------- 1. settings + orders

alter table public.store_settings
  add column if not exists gst_rate numeric(5, 2) not null default 18 check (gst_rate >= 0 and gst_rate <= 40),
  add column if not exists gst_inclusive boolean not null default true,
  add column if not exists gst_input_credit boolean not null default false;

alter table public.orders
  add column if not exists gst_rate numeric(5, 2) not null default 0,
  add column if not exists gst_inclusive boolean not null default true;

-- the test orders from 0013 get the default GST so the reports have something to show
update public.orders
   set gst_rate = 18, gst_inclusive = true, tax = round(subtotal * 18 / 118, 2)
 where is_test and gst_rate = 0;

-- ---------------------------------------------------------------- 2. costs

create table if not exists public.variant_costs (
  variant_id uuid primary key references public.product_variants (id) on delete cascade,
  cost numeric(10, 2) not null check (cost >= 0),
  updated_at timestamptz not null default now()
);

drop trigger if exists variant_costs_touch_updated_at on public.variant_costs;
create trigger variant_costs_touch_updated_at
  before update on public.variant_costs
  for each row execute function public.touch_updated_at();

alter table public.variant_costs enable row level security;
drop policy if exists "admins manage costs" on public.variant_costs;
create policy "admins manage costs" on public.variant_costs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
revoke all on public.variant_costs from anon, authenticated;
grant select, insert, update, delete on public.variant_costs to authenticated;

create table if not exists public.order_item_costs (
  order_item_id uuid primary key references public.order_items (id) on delete cascade,
  unit_cost numeric(10, 2) not null check (unit_cost >= 0)
);

alter table public.order_item_costs enable row level security;
drop policy if exists "admins read sold costs" on public.order_item_costs;
create policy "admins read sold costs" on public.order_item_costs
  for select to authenticated
  using (public.is_admin());
revoke all on public.order_item_costs from anon, authenticated;
grant select on public.order_item_costs to authenticated;

-- ---------------------------------------------------------------- 3. checkout with GST + cost

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
  tax numeric(10, 2) := 0;
  rate numeric(5, 2) := 0;
  incl boolean := true;
  oi_id uuid;
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

    select pv.id, pv.label, pv.sku, pv.price, pv.stock_qty, pv.track_stock, p.name,
           (select vc.cost from public.variant_costs vc where vc.variant_id = pv.id) as cost
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
      'sku', v.sku, 'price', v.price, 'qty', n, 'track', v.track_stock, 'cost', v.cost);
  end loop;

  select st.shipping, st.free_shipping_over, st.gst_rate, st.gst_inclusive into s from public.store_settings st where st.id = 1;
  ship := case when s.free_shipping_over is not null and sub >= s.free_shipping_over then 0 else coalesce(s.shipping, 0) end;
  -- GST on the goods: already inside the shelf price, or added on top
  rate := coalesce(s.gst_rate, 0);
  incl := coalesce(s.gst_inclusive, true);
  tax := case when incl then round(sub * rate / (100 + rate), 2) else round(sub * rate / 100, 2) end;

  insert into public.orders (
    profile_id, contact_name, contact_email, contact_phone,
    address_line1, address_line2, address_landmark, address_city, address_state, address_pincode,
    address_latitude, address_longitude, subtotal, shipping, tax, total, notes, gst_rate, gst_inclusive)
  values (
    uid, trim(p_address ->> 'recipient_name'), coalesce(email, ''), trim(p_address ->> 'phone'),
    trim(p_address ->> 'line1'), coalesce(trim(p_address ->> 'line2'), ''), coalesce(trim(p_address ->> 'landmark'), ''),
    trim(p_address ->> 'city'), trim(p_address ->> 'state'), trim(p_address ->> 'pincode'),
    nullif(p_address ->> 'latitude', '')::double precision, nullif(p_address ->> 'longitude', '')::double precision,
    sub, ship, tax, sub + ship + case when incl then 0 else tax end, left(coalesce(p_notes, ''), 1000), rate, incl)
  returning id, orders.order_number into o_id, o_no;

  perform set_config('babajee.stock_reason', 'sale', true);
  perform set_config('babajee.order_id', o_id::text, true);
  for item in select * from jsonb_array_elements(lines) loop
    insert into public.order_items (order_id, variant_id, product_name, variant_label, sku, unit_price, quantity)
    values (o_id, (item ->> 'variant_id')::uuid, item ->> 'name', item ->> 'label', item ->> 'sku',
            (item ->> 'price')::numeric, (item ->> 'qty')::int)
    returning id into oi_id;
    -- what it cost the shop at the time of sale, kept away from the customer
    if item ->> 'cost' is not null then
      insert into public.order_item_costs (order_item_id, unit_cost) values (oi_id, (item ->> 'cost')::numeric);
    end if;
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

-- ---------------------------------------------------------------- 4. profit report

create or replace function public.admin_profit(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t0 timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  t1 timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
  credit boolean;
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  select st.gst_input_credit into credit from public.store_settings st where st.id = 1;
  credit := coalesce(credit, false);

  with o as (
    select * from public.orders
     where created_at >= t0 and created_at < t1 and status not in ('cancelled', 'refunded')
  ),
  l as (
    select o.id as order_id, (o.created_at at time zone 'Asia/Kolkata')::date as day,
           i.product_name, i.quantity as q,
           -- one unit's sale with GST taken out
           case when o.gst_inclusive then i.unit_price * 100 / (100 + o.gst_rate) else i.unit_price end as net,
           coalesce(c.unit_cost, vc.cost) as cost,
           o.gst_rate as rate
      from o
      join public.order_items i on i.order_id = o.id
      left join public.order_item_costs c on c.order_item_id = i.id
      left join public.variant_costs vc on vc.variant_id = i.variant_id
  ),
  m as (
    select l.*,
           case when cost is null then null
                when credit then cost * 100 / (100 + rate) else cost end as cost_ex
      from l
  ),
  days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  )
  select jsonb_build_object(
    'input_credit', credit,
    'net_sales', (select round(coalesce(sum(q * net), 0), 2) from m),
    'costed_sales', (select round(coalesce(sum(q * net), 0), 2) from m where cost is not null),
    'cost', (select round(coalesce(sum(q * cost_ex), 0), 2) from m),
    'profit', (select round(coalesce(sum(q * (net - cost_ex)), 0), 2) from m where cost is not null),
    'uncosted_lines', (select count(*) from m where cost is null),
    'lines', (select count(*) from m),
    'gst_collected', (select coalesce(sum(tax), 0) from o),
    'gst_on_top', (select coalesce(sum(tax), 0) from o where not gst_inclusive),
    'gst_paid', (select round(coalesce(sum(q * (cost - cost_ex)), 0), 2) from m where cost is not null),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', days.day, 'profit', coalesce(x.p, 0)) order by days.day), '[]')
        from days left join (
          select day, round(sum(q * (net - cost_ex)), 2) as p from m where cost is not null group by day) x on x.day = days.day),
    'top', (
      select coalesce(jsonb_agg(x), '[]') from (
        select product_name as name, sum(q) as qty, round(sum(q * net), 2) as sales,
               round(sum(q * (net - cost_ex)), 2) as profit
          from m where cost is not null
         group by product_name order by 4 desc limit 8) x)
  ) into r;
  return r;
end;
$$;

revoke all on function public.admin_profit(date, date) from public, anon;
grant execute on function public.admin_profit(date, date) to authenticated;
