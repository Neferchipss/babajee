-- Partial refunds, returns, and editing an order.
--
-- 1. orders.paid_total: what the customer actually paid, set the moment an
--    order leaves "pending". An edit after payment changes the total but not
--    this, so the difference is a balance to collect or pay back.
-- 2. order_refunds (+ order_refund_items): every refund, whole or partial.
--    amount is the money sent back; subtotal / shipping / tax split it the
--    way the order was split, so reports can take each part off. A refund
--    can name items (a return) and put them back in stock, or be an amount
--    alone (a goodwill refund, or delivery charged by mistake).
--    Once refunds reach what was paid, the order becomes "refunded".
-- 3. admin_refund(...)          records one refund
--    admin_edit_order(...)      quantities, added / removed items, delivery,
--                               contact and address, before shipping
--    admin_settle_balance(...)  records that the edit's difference was
--                               collected or paid back
--    admin_update_order         no longer refunds; that goes through admin_refund
-- 4. Analytics, profit and reports count returns from order_refunds:
--    returns    = refunds' item value (subtotal)
--    sold       = quantity less refunded quantity
--    cost       = counted for every unit not put back in stock
--    GST        = collected less GST refunded
--
-- Depends on 0013, 0015, 0016. Safe to re-run.

-- ---------------------------------------------------------------- 1. paid

alter table public.orders add column if not exists paid_total numeric(10, 2);
update public.orders set paid_total = total
 where paid_total is null and status in ('paid', 'packed', 'shipped', 'delivered', 'refunded');

create or replace function public.orders_set_paid()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status in ('paid', 'packed', 'shipped', 'delivered') and new.paid_total is null then
    new.paid_total := new.total;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_set_paid on public.orders;
create trigger orders_set_paid
  before update of status on public.orders
  for each row execute function public.orders_set_paid();

alter table public.stock_movements drop constraint if exists stock_movements_reason_check;
alter table public.stock_movements add constraint stock_movements_reason_check
  check (reason in ('sale', 'cancel', 'refund', 'return', 'edit', 'manual'));

-- ---------------------------------------------------------------- 2. refunds

create table if not exists public.order_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  subtotal numeric(10, 2) not null default 0,
  shipping numeric(10, 2) not null default 0 check (shipping >= 0),
  tax numeric(10, 2) not null default 0,
  restocked boolean not null default false,
  returned boolean not null default false,
  reason text not null default '',
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists order_refunds_order_idx on public.order_refunds (order_id);

create table if not exists public.order_refund_items (
  refund_id uuid not null references public.order_refunds (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  quantity int not null check (quantity > 0),
  primary key (refund_id, order_item_id)
);
create index if not exists order_refund_items_item_idx on public.order_refund_items (order_item_id);

alter table public.order_refunds enable row level security;
alter table public.order_refund_items enable row level security;

-- the customer sees refunds on their own orders (the reason stays on the
-- admin's timeline, but the row is theirs to read); writes go through
-- admin_refund only
drop policy if exists "read own refunds" on public.order_refunds;
create policy "read own refunds" on public.order_refunds
  for select to authenticated
  using (exists (select 1 from public.orders o
                  where o.id = order_id and (o.profile_id = (select auth.uid()) or public.is_admin())));
drop policy if exists "read own refund items" on public.order_refund_items;
create policy "read own refund items" on public.order_refund_items
  for select to authenticated
  using (exists (select 1 from public.order_refunds r join public.orders o on o.id = r.order_id
                  where r.id = refund_id and (o.profile_id = (select auth.uid()) or public.is_admin())));
revoke all on public.order_refunds, public.order_refund_items from anon, authenticated;
grant select on public.order_refunds, public.order_refund_items to authenticated;

-- orders refunded before this file: one refund for the whole order
insert into public.order_refunds (order_id, amount, subtotal, shipping, tax, restocked, returned, reason, created_at)
select o.id, o.total, o.subtotal, o.shipping, o.tax,
       exists (select 1 from public.stock_movements m where m.order_id = o.id and m.reason = 'refund'),
       false, '',
       coalesce((select max(e.created_at) from public.order_events e where e.order_id = o.id and e.status = 'refunded'), o.updated_at)
  from public.orders o
 where o.status = 'refunded' and o.total > 0
   and not exists (select 1 from public.order_refunds r where r.order_id = o.id);
insert into public.order_refund_items (refund_id, order_item_id, quantity)
select r.id, i.id, i.quantity
  from public.order_refunds r
  join public.orders o on o.id = r.order_id and o.status = 'refunded'
  join public.order_items i on i.order_id = o.id
 where not exists (select 1 from public.order_refund_items x where x.refund_id = r.id);

-- per order item: how many were refunded, and how many of those went back on the shelf
create or replace view public.order_item_refunded as
select ri.order_item_id,
       sum(ri.quantity)::int as qty,
       coalesce(sum(ri.quantity) filter (where r.restocked), 0)::int as restocked
  from public.order_refund_items ri
  join public.order_refunds r on r.id = ri.refund_id
 group by ri.order_item_id;

-- per order: money refunded, split; "extra" is item value refunded beyond
-- (or short of) the items named, e.g. a goodwill refund with no items
create or replace view public.order_refund_totals as
select r.order_id,
       sum(r.amount) as amount,
       sum(r.subtotal) as subtotal,
       sum(r.shipping) as shipping,
       sum(r.tax) as tax,
       sum(r.subtotal) - coalesce(sum((select sum(ri.quantity * i.unit_price)
                                         from public.order_refund_items ri
                                         join public.order_items i on i.id = ri.order_item_id
                                        where ri.refund_id = r.id)), 0) as extra
  from public.order_refunds r
 group by r.order_id;

revoke all on public.order_item_refunded, public.order_refund_totals from public, anon, authenticated;

-- ---------------------------------------------------------------- 3a. refund

-- "₹1,250" style for timeline notes (no Indian grouping in to_char; plain is fine)
create or replace function public.rupees(x numeric)
returns text
language sql
immutable
set search_path = ''
as $$ select '₹' || regexp_replace(to_char(x, 'FM999999990.00'), '\.00$', '') $$;

-- p_lines: [{ "item": "<order_item id>", "qty": 1 }, ...] (may be empty)
create or replace function public.admin_refund(
  p_order uuid,
  p_lines jsonb,
  p_shipping numeric,
  p_amount numeric,
  p_restock boolean,
  p_returned boolean,
  p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  ln jsonb;
  it record;
  n int;
  done_qty int;
  paid numeric;
  so_far numeric;
  ship_left numeric;
  rest numeric;
  sub numeric;
  tx numeric;
  r_id uuid;
  what text[] := '{}';
  note text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can refund an order.' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null then
    raise exception 'Order not found.';
  end if;
  if o.status = 'pending' then
    raise exception 'Nothing was paid yet. Cancel the order instead.';
  elsif o.status in ('cancelled', 'refunded') then
    raise exception 'This order is already %.', o.status;
  end if;

  paid := coalesce(o.paid_total, o.total);
  select coalesce(sum(amount), 0), coalesce(sum(shipping), 0) into so_far, ship_left
    from public.order_refunds where order_id = p_order;
  ship_left := o.shipping - ship_left;
  p_amount := round(coalesce(p_amount, 0), 2);
  p_shipping := round(coalesce(p_shipping, 0), 2);

  if p_amount <= 0 then
    raise exception 'Enter an amount to refund.';
  end if;
  if p_amount > paid - so_far then
    raise exception 'You can refund up to % on this order.', public.rupees(paid - so_far);
  end if;
  if p_shipping < 0 or p_shipping > ship_left then
    raise exception 'Delivery refund can be up to %.', public.rupees(greatest(ship_left, 0));
  end if;
  if p_shipping > p_amount then
    raise exception 'The refund must cover the delivery being refunded.';
  end if;

  -- the item part, split into its own value and GST the way the order was
  rest := p_amount - p_shipping;
  if o.gst_inclusive then
    sub := rest;
    tx := round(rest * o.gst_rate / (100 + o.gst_rate), 2);
  else
    sub := round(rest * 100 / (100 + o.gst_rate), 2);
    tx := rest - sub;
  end if;

  insert into public.order_refunds (order_id, amount, subtotal, shipping, tax, restocked, returned, reason, actor_id)
  values (p_order, p_amount, sub, p_shipping, tx, coalesce(p_restock, false), coalesce(p_returned, false),
          left(coalesce(trim(p_reason), ''), 500), (select auth.uid()))
  returning id into r_id;

  perform set_config('babajee.stock_reason', case when p_returned then 'return' else 'refund' end, true);
  perform set_config('babajee.order_id', p_order::text, true);
  for ln in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    n := coalesce((ln ->> 'qty')::int, 0);
    continue when n = 0;
    select i.*, pv.track_stock into it
      from public.order_items i left join public.product_variants pv on pv.id = i.variant_id
     where i.id = (ln ->> 'item')::uuid and i.order_id = p_order;
    if it.id is null then
      raise exception 'That item is not on this order.';
    end if;
    select coalesce(sum(quantity), 0) into done_qty from public.order_refund_items where order_item_id = it.id;
    if n < 0 or n > it.quantity - done_qty then
      raise exception 'Only % of % can still be refunded.', it.quantity - done_qty, it.product_name;
    end if;
    insert into public.order_refund_items (refund_id, order_item_id, quantity) values (r_id, it.id, n);
    what := what || (it.product_name || case when n > 1 then ' ×' || n else '' end);
    if p_restock and it.track_stock then
      update public.product_variants set stock_qty = stock_qty + n where id = it.variant_id;
    end if;
  end loop;
  perform set_config('babajee.stock_reason', '', true);
  perform set_config('babajee.order_id', '', true);

  note := concat_ws(' · ',
    public.rupees(p_amount),
    nullif(array_to_string(what, ', '), ''),
    case when p_shipping > 0 then 'delivery ' || public.rupees(p_shipping) end,
    case when p_restock and cardinality(what) > 0 then 'back in stock' end,
    nullif(left(coalesce(trim(p_reason), ''), 500), ''));
  insert into public.order_events (order_id, status, note, actor_id)
  values (p_order, case when p_returned then 'return' else 'refund' end, note, (select auth.uid()));

  if so_far + p_amount >= paid then
    perform set_config('babajee.event_note', 'Everything paid has been refunded', true);
    update public.orders set status = 'refunded' where id = p_order;
    perform set_config('babajee.event_note', '', true);
  end if;
end;
$$;

revoke all on function public.admin_refund(uuid, jsonb, numeric, numeric, boolean, boolean, text) from public, anon;
grant execute on function public.admin_refund(uuid, jsonb, numeric, numeric, boolean, boolean, text) to authenticated;

-- ---------------------------------------------------------------- 3b. edit

-- p_lines:   [{ "item": "<order_item id>", "qty": 3 }   change or (0) remove
--             { "variant": "<variant id>", "qty": 1 }]  add
--            items not mentioned stay as they are
-- p_shipping: new delivery charge, or null to keep it
-- p_contact: { name, phone, email } or null;  p_address: { line1, line2,
--            landmark, city, state, pincode } or null
create or replace function public.admin_edit_order(
  p_order uuid,
  p_lines jsonb,
  p_shipping numeric default null,
  p_contact jsonb default null,
  p_address jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  ln jsonb;
  it record;
  v record;
  n int;
  diff int;
  sub numeric;
  ship numeric;
  tx numeric;
  tot numeric;
  oi_id uuid;
  what text[] := '{}';
  addr_changed boolean := false;
  note text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can edit an order.' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null then
    raise exception 'Order not found.';
  end if;
  if o.status not in ('pending', 'paid', 'packed') then
    raise exception 'Only an order that has not shipped can be edited.';
  end if;
  if exists (select 1 from public.order_refunds where order_id = p_order) then
    raise exception 'This order has a refund on it, so it can no longer be edited.';
  end if;

  perform set_config('babajee.stock_reason', 'edit', true);
  perform set_config('babajee.order_id', p_order::text, true);

  for ln in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    n := coalesce((ln ->> 'qty')::int, -1);
    if n < 0 or n > 99 then
      raise exception 'Quantities must be between 0 and 99.';
    end if;

    if ln ? 'item' then
      select i.*, pv.track_stock, pv.stock_qty into it
        from public.order_items i left join public.product_variants pv on pv.id = i.variant_id
       where i.id = (ln ->> 'item')::uuid and i.order_id = p_order
         for update of i;
      if it.id is null then
        raise exception 'That item is not on this order.';
      end if;
      continue when n = it.quantity;
      diff := n - it.quantity;
      if it.track_stock then
        if diff > 0 and it.stock_qty < diff then
          raise exception 'Only % more of % in stock.', it.stock_qty, it.product_name;
        end if;
        update public.product_variants set stock_qty = stock_qty - diff where id = it.variant_id;
      end if;
      if n = 0 then
        delete from public.order_items where id = it.id;
        what := what || ('removed ' || it.product_name);
      else
        update public.order_items set quantity = n where id = it.id;
        what := what || (it.product_name || ' ×' || it.quantity || ' → ×' || n);
      end if;

    elsif ln ? 'variant' then
      continue when n = 0;
      select pv.id, pv.label, pv.sku, pv.price, pv.stock_qty, pv.track_stock, p.name,
             (select vc.cost from public.variant_costs vc where vc.variant_id = pv.id) as cost
        into v
        from public.product_variants pv join public.products p on p.id = pv.product_id
       where pv.id = (ln ->> 'variant')::uuid
         for update of pv;
      if v.id is null then
        raise exception 'That product option no longer exists.';
      end if;
      if v.price <= 0 then
        raise exception '% has no price yet.', v.name;
      end if;
      if v.track_stock and v.stock_qty < n then
        raise exception 'Only % of % in stock.', v.stock_qty, v.name;
      end if;
      insert into public.order_items (order_id, variant_id, product_name, variant_label, sku, unit_price, quantity)
      values (p_order, v.id, v.name, case when v.label = 'Default' then '' else v.label end, v.sku, v.price, n)
      returning id into oi_id;
      if v.cost is not null then
        insert into public.order_item_costs (order_item_id, unit_cost) values (oi_id, v.cost);
      end if;
      if v.track_stock then
        update public.product_variants set stock_qty = stock_qty - n where id = v.id;
      end if;
      what := what || ('added ' || v.name || case when n > 1 then ' ×' || n else '' end);
    end if;
  end loop;

  perform set_config('babajee.stock_reason', '', true);
  perform set_config('babajee.order_id', '', true);

  if not exists (select 1 from public.order_items where order_id = p_order) then
    raise exception 'An order needs at least one item. Cancel it instead.';
  end if;

  select coalesce(sum(quantity * unit_price), 0) into sub from public.order_items where order_id = p_order;
  ship := round(coalesce(p_shipping, o.shipping), 2);
  if ship < 0 then
    raise exception 'Delivery cannot be negative.';
  end if;
  if ship <> o.shipping then
    what := what || ('delivery ' || public.rupees(o.shipping) || ' → ' || public.rupees(ship));
  end if;
  tx := case when o.gst_inclusive then round(sub * o.gst_rate / (100 + o.gst_rate), 2) else round(sub * o.gst_rate / 100, 2) end;
  tot := sub + ship + case when o.gst_inclusive then 0 else tx end;

  if p_contact is not null then
    if coalesce(trim(p_contact ->> 'name'), '') = '' or coalesce(trim(p_contact ->> 'phone'), '') = '' then
      raise exception 'The customer needs a name and a phone number.';
    end if;
    if trim(p_contact ->> 'name') <> o.contact_name or trim(p_contact ->> 'phone') <> o.contact_phone
       or coalesce(trim(p_contact ->> 'email'), '') <> o.contact_email then
      what := what || 'contact details'::text;
    end if;
  end if;
  if p_address is not null then
    if coalesce(trim(p_address ->> 'line1'), '') = '' or coalesce(trim(p_address ->> 'city'), '') = ''
       or coalesce(trim(p_address ->> 'state'), '') = '' or coalesce(trim(p_address ->> 'pincode'), '') = '' then
      raise exception 'Add a full delivery address.';
    end if;
    addr_changed := trim(p_address ->> 'line1') <> o.address_line1
      or coalesce(trim(p_address ->> 'line2'), '') <> o.address_line2
      or coalesce(trim(p_address ->> 'landmark'), '') <> o.address_landmark
      or trim(p_address ->> 'city') <> o.address_city
      or trim(p_address ->> 'state') <> o.address_state
      or trim(p_address ->> 'pincode') <> o.address_pincode;
    if addr_changed then
      what := what || 'delivery address'::text;
    end if;
  end if;

  if cardinality(what) = 0 then
    return;
  end if;

  update public.orders set
    subtotal = sub, shipping = ship, tax = tx, total = tot,
    contact_name = coalesce(trim(p_contact ->> 'name'), contact_name),
    contact_phone = coalesce(trim(p_contact ->> 'phone'), contact_phone),
    contact_email = case when p_contact is null then contact_email else coalesce(trim(p_contact ->> 'email'), '') end,
    address_line1 = coalesce(trim(p_address ->> 'line1'), address_line1),
    address_line2 = case when p_address is null then address_line2 else coalesce(trim(p_address ->> 'line2'), '') end,
    address_landmark = case when p_address is null then address_landmark else coalesce(trim(p_address ->> 'landmark'), '') end,
    address_city = coalesce(trim(p_address ->> 'city'), address_city),
    address_state = coalesce(trim(p_address ->> 'state'), address_state),
    address_pincode = coalesce(trim(p_address ->> 'pincode'), address_pincode),
    -- a pin dropped for the old address would send the courier to the wrong door
    address_latitude = case when addr_changed then null else address_latitude end,
    address_longitude = case when addr_changed then null else address_longitude end
  where id = p_order;

  note := array_to_string(what, ' · ');
  if tot <> o.total then
    note := note || ' · total ' || public.rupees(o.total) || ' → ' || public.rupees(tot);
  end if;
  if o.paid_total is not null and tot <> o.paid_total then
    note := note || case when tot > o.paid_total then ' · ' || public.rupees(tot - o.paid_total) || ' more to collect'
                         else ' · ' || public.rupees(o.paid_total - tot) || ' to pay back' end;
  end if;
  insert into public.order_events (order_id, status, note, actor_id)
  values (p_order, 'edited', note, (select auth.uid()));
end;
$$;

revoke all on function public.admin_edit_order(uuid, jsonb, numeric, jsonb, jsonb) from public, anon;
grant execute on function public.admin_edit_order(uuid, jsonb, numeric, jsonb, jsonb) to authenticated;

-- After an edit changed a paid order's total: the difference was collected
-- (or paid back) outside the site; this records it.
create or replace function public.admin_settle_balance(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.paid_total is null or o.paid_total = o.total then
    raise exception 'Nothing to settle on this order.';
  end if;
  update public.orders set paid_total = total where id = p_order;
  insert into public.order_events (order_id, status, note, actor_id)
  values (p_order, 'balance',
          case when o.total > o.paid_total then 'Collected ' || public.rupees(o.total - o.paid_total)
               else 'Paid back ' || public.rupees(o.paid_total - o.total) end,
          (select auth.uid()));
end;
$$;

revoke all on function public.admin_settle_balance(uuid) from public, anon;
grant execute on function public.admin_settle_balance(uuid) to authenticated;

-- ---------------------------------------------------------------- 3c. status changes: refunds moved out

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
    if exists (select 1 from public.order_refunds where order_id = p_order) then
      raise exception 'This order has a refund on it. Refund the rest instead of cancelling.';
    end if;
  elsif p_status = 'refunded' then
    raise exception 'Use Refund on the order to record a refund.';
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

  if p_status = 'cancelled' then
    perform set_config('babajee.stock_reason', 'cancel', true);
    perform set_config('babajee.order_id', p_order::text, true);
    update public.product_variants pv
       set stock_qty = pv.stock_qty + oi.qty
      from (select variant_id, sum(quantity)::int qty from public.order_items
             where order_id = p_order and variant_id is not null group by variant_id) oi
     where pv.id = oi.variant_id and pv.track_stock;
  end if;

  perform set_config('babajee.event_note', note, true);
  update public.orders set status = p_status where id = p_order;
  perform set_config('babajee.event_note', '', true);
  perform set_config('babajee.stock_reason', '', true);
  perform set_config('babajee.order_id', '', true);
end;
$$;

-- ---------------------------------------------------------------- 4a. analytics

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
    select x.*, coalesce(rt.subtotal, 0) as r_sub, coalesce(rt.shipping, 0) as r_ship, coalesce(rt.tax, 0) as r_tax
      from public.orders x left join public.order_refund_totals rt on rt.order_id = x.id
     where x.created_at >= t0 and x.created_at < t1 and x.status <> 'cancelled'
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
    'returns', (select coalesce(sum(r_sub), 0) from o),
    'shipping', (select coalesce(sum(shipping - r_ship), 0) from o),
    'tax', (select coalesce(sum(tax - r_tax), 0) from o),
    'fulfilled', (select count(*) from o where status in ('shipped', 'delivered')),
    'customers', (select count(*) from buyers),
    'returning', (select count(*) from buyers where before or n > 1),
    'cancelled', (select count(*) from public.orders where created_at >= t0 and created_at < t1 and status = 'cancelled'),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'gross', gross, 'orders', orders) order by day), '[]') from daily),
    'top_products', (
      select coalesce(jsonb_agg(x), '[]') from (
        select i.product_name as name,
               sum(i.quantity - coalesce(ir.qty, 0)) as qty,
               sum((i.quantity - coalesce(ir.qty, 0)) * i.unit_price) as sales
          from public.order_items i join o on o.id = i.order_id
          left join public.order_item_refunded ir on ir.order_item_id = i.id
         group by i.product_name
        having sum(i.quantity - coalesce(ir.qty, 0)) > 0
         order by sales desc limit 8) x),
    'by_state', (
      select coalesce(jsonb_agg(x), '[]') from (
        select address_state as name, count(*) as orders, sum(subtotal - r_sub) as sales
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

-- ---------------------------------------------------------------- 4b. profit

-- Per line: kept units earn their sale (GST taken out); every unit not put
-- back on the shelf costs. A refund's value beyond the items it names
-- ("extra", e.g. goodwill) comes off sales and profit at order level.
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
    select x.*, coalesce(rt.tax, 0) as r_tax, coalesce(rt.extra, 0) as extra
      from public.orders x left join public.order_refund_totals rt on rt.order_id = x.id
     where x.created_at >= t0 and x.created_at < t1 and x.status <> 'cancelled'
  ),
  l as (
    select o.id as order_id, (o.created_at at time zone 'Asia/Kolkata')::date as day,
           i.product_name,
           i.quantity - coalesce(ir.qty, 0) as q,            -- units the customer kept
           i.quantity - coalesce(ir.restocked, 0) as gone,   -- units that left the shelf for good
           case when o.gst_inclusive then i.unit_price * 100 / (100 + o.gst_rate) else i.unit_price end as net,
           coalesce(c.unit_cost, vc.cost) as cost,
           o.gst_rate as rate
      from o
      join public.order_items i on i.order_id = o.id
      left join public.order_item_refunded ir on ir.order_item_id = i.id
      left join public.order_item_costs c on c.order_item_id = i.id
      left join public.variant_costs vc on vc.variant_id = i.variant_id
  ),
  m as (
    select l.*,
           case when cost is null then null
                when credit then cost * 100 / (100 + rate) else cost end as cost_ex
      from l
  ),
  -- goodwill / amount-only refunds, without GST, per order
  x as (
    select o.id as order_id, (o.created_at at time zone 'Asia/Kolkata')::date as day,
           o.extra * case when o.gst_inclusive then 100 / (100 + o.gst_rate) else 1 end as extra_ex,
           not exists (select 1 from m where m.order_id = o.id and m.cost is null) as costed
      from o where o.extra <> 0
  ),
  days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  )
  select jsonb_build_object(
    'input_credit', credit,
    'net_sales', (select round(coalesce(sum(q * net), 0) - coalesce((select sum(extra_ex) from x), 0), 2) from m),
    'costed_sales', (select round(coalesce(sum(q * net), 0) - coalesce((select sum(extra_ex) from x where costed), 0), 2) from m where cost is not null),
    'cost', (select round(coalesce(sum(gone * cost_ex), 0), 2) from m),
    'profit', (select round(coalesce(sum(q * net - gone * cost_ex), 0) - coalesce((select sum(extra_ex) from x where costed), 0), 2) from m where cost is not null),
    'uncosted_lines', (select count(*) from m where cost is null and gone > 0),
    'lines', (select count(*) from m where gone > 0),
    'gst_collected', (select coalesce(sum(tax - r_tax), 0) from o),
    'gst_on_top', (select coalesce(sum(tax - r_tax), 0) from o where not gst_inclusive),
    'gst_paid', (select round(coalesce(sum(gone * (cost - cost_ex)), 0), 2) from m where cost is not null),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', days.day, 'profit', round(coalesce(a.p, 0) - coalesce(b.e, 0), 2)) order by days.day), '[]')
        from days
        left join (select day, sum(q * net - gone * cost_ex) as p from m where cost is not null group by day) a on a.day = days.day
        left join (select day, sum(extra_ex) as e from x where costed group by day) b on b.day = days.day),
    'top', (
      select coalesce(jsonb_agg(t), '[]') from (
        select product_name as name, sum(q) as qty, round(sum(q * net), 2) as sales,
               round(sum(q * net - gone * cost_ex), 2) as profit
          from m where cost is not null
         group by product_name
        having sum(gone) > 0
         order by 4 desc limit 8) t)
  ) into r;
  return r;
end;
$$;

-- ---------------------------------------------------------------- 4c. reports

create or replace function public.admin_report(p_kind text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t0 timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  t1 timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
  ndays int := (p_to - p_from) + 1;
  credit boolean;
  home text;
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if p_to < p_from or ndays > 3700 then
    raise exception 'Pick a start date on or before the end date.' using errcode = '22023';
  end if;
  select coalesce(st.gst_input_credit, false), coalesce(st.store_state, '')
    into credit, home
    from public.store_settings st where st.id = 1;
  credit := coalesce(credit, false);
  home := coalesce(home, '');

  if p_kind = 'products' then
    with o as (
      select * from public.orders where created_at >= t0 and created_at < t1 and status <> 'cancelled'
    ),
    l as (
      select i.product_name, i.variant_label, i.quantity as qty, i.unit_price as price,
             i.quantity - coalesce(ir.qty, 0) as q,
             i.quantity - coalesce(ir.restocked, 0) as gone,
             coalesce(ir.qty, 0) as back,
             case when o.gst_inclusive then i.unit_price * 100 / (100 + o.gst_rate) else i.unit_price end as net,
             case when coalesce(c.unit_cost, vc.cost) is null then null
                  when credit then coalesce(c.unit_cost, vc.cost) * 100 / (100 + o.gst_rate)
                  else coalesce(c.unit_cost, vc.cost) end as cost_ex
        from o
        join public.order_items i on i.order_id = o.id
        left join public.order_item_refunded ir on ir.order_item_id = i.id
        left join public.order_item_costs c on c.order_item_id = i.id
        left join public.variant_costs vc on vc.variant_id = i.variant_id
    )
    select coalesce(jsonb_agg(x order by x.gross desc, x.product), '[]') into r from (
      select product_name as product,
             variant_label as option,
             sum(q) as sold,
             sum(qty * price) as gross,
             sum(back * price) as returns,
             sum(q * price) as net,
             round(sum(q * net), 2) as sales_ex_gst,
             case when bool_and(cost_ex is not null) then round(sum(gone * cost_ex), 2) end as cost,
             case when bool_and(cost_ex is not null) then round(sum(q * net - gone * cost_ex), 2) end as profit
        from l
       group by product_name, variant_label
    ) x;

  elsif p_kind = 'customers' then
    with o as (
      select o.*, coalesce(rt.subtotal, 0) as r_sub,
             (select coalesce(sum(i.quantity - coalesce(ir.qty, 0)), 0)
                from public.order_items i left join public.order_item_refunded ir on ir.order_item_id = i.id
               where i.order_id = o.id) as items
        from public.orders o left join public.order_refund_totals rt on rt.order_id = o.id
       where o.created_at >= t0 and o.created_at < t1 and o.status <> 'cancelled'
    )
    select coalesce(jsonb_agg(x order by x.net desc, x.name), '[]') into r from (
      select (array_agg(contact_name order by created_at desc))[1] as name,
             (array_agg(contact_email order by created_at desc))[1] as email,
             (array_agg(contact_phone order by created_at desc))[1] as phone,
             bool_and(profile_id is null) as guest,
             count(*) as orders,
             sum(items) as items,
             sum(subtotal) as gross,
             sum(r_sub) as returns,
             sum(subtotal - r_sub) as net,
             round(sum(subtotal) / count(*), 2) as average,
             min(created_at at time zone 'Asia/Kolkata')::date as first_order,
             max(created_at at time zone 'Asia/Kolkata')::date as last_order
        from o
       group by coalesce(profile_id::text, lower(contact_email))
    ) x;

  elsif p_kind = 'stock' then
    with sold as (
      select i.variant_id, sum(i.quantity - coalesce(ir.qty, 0)) as q
        from public.orders o join public.order_items i on i.order_id = o.id
        left join public.order_item_refunded ir on ir.order_item_id = i.id
       where o.created_at >= t0 and o.created_at < t1 and o.status <> 'cancelled'
       group by i.variant_id
    )
    select coalesce(jsonb_agg(x order by x.days_left asc nulls last, x.sold desc, x.product, x.option), '[]') into r from (
      select p.name as product, v.label as option, v.sku, v.track_stock as tracked,
             case when v.track_stock then v.stock_qty end as in_stock,
             coalesce(s.q, 0) as sold,
             round(coalesce(s.q, 0)::numeric / ndays, 2) as per_day,
             case when v.track_stock and coalesce(s.q, 0) > 0
                  then floor(v.stock_qty / (s.q::numeric / ndays)) end as days_left,
             case when v.track_stock and coalesce(s.q, 0) + v.stock_qty > 0
                  then round(coalesce(s.q, 0) * 100.0 / (coalesce(s.q, 0) + v.stock_qty), 1) end as sell_through
        from public.product_variants v
        join public.products p on p.id = v.product_id
        left join sold s on s.variant_id = v.id
    ) x;

  elsif p_kind = 'finance' then
    with o as (
      select o.*, date_trunc('month', o.created_at at time zone 'Asia/Kolkata')::date as month,
             coalesce(rt.amount, 0) as r_amt, coalesce(rt.subtotal, 0) as r_sub,
             coalesce(rt.shipping, 0) as r_ship, coalesce(rt.tax, 0) as r_tax, coalesce(rt.extra, 0) as extra
        from public.orders o left join public.order_refund_totals rt on rt.order_id = o.id
       where o.created_at >= t0 and o.created_at < t1 and o.status <> 'cancelled'
    ),
    l as (
      select o.month, o.id as order_id,
             i.quantity - coalesce(ir.qty, 0) as q,
             i.quantity - coalesce(ir.restocked, 0) as gone,
             case when o.gst_inclusive then i.unit_price * 100 / (100 + o.gst_rate) else i.unit_price end as net,
             coalesce(oc.unit_cost, vc.cost) as cost, o.gst_rate as rate
        from o
        join public.order_items i on i.order_id = o.id
        left join public.order_item_refunded ir on ir.order_item_id = i.id
        left join public.order_item_costs oc on oc.order_item_id = i.id
        left join public.variant_costs vc on vc.variant_id = i.variant_id
    ),
    m as (
      select l.*, case when cost is null then null when credit then cost * 100 / (100 + rate) else cost end as cost_ex from l
    ),
    c as (
      select month,
             sum(gone * cost_ex) as cost,
             sum(gone * (cost - cost_ex)) as gst_paid,
             sum(q * net) filter (where cost is not null) as costed_sales,
             count(*) filter (where cost is null and gone > 0) as uncosted
        from m group by month
    ),
    x as (
      select o.month, sum(o.extra * case when o.gst_inclusive then 100 / (100 + o.gst_rate) else 1 end) as extra_ex
        from o where o.extra <> 0 group by o.month
    )
    select coalesce(jsonb_agg(y order by y.month), '[]') into r from (
      select m.month,
             count(*) filter (where m.status <> 'refunded') as orders,
             sum(m.subtotal) as gross,
             sum(m.r_sub) as returns,
             sum(m.subtotal - m.r_sub) as net,
             sum(m.shipping - m.r_ship) as delivery,
             sum(m.tax - m.r_tax) as gst,
             sum(coalesce(m.paid_total, m.total) - m.r_amt) filter (where m.status <> 'pending') as collected,
             case when max(c.costed_sales) is not null then round(max(c.cost), 2) end as cost,
             case when max(c.costed_sales) is not null then round(max(c.costed_sales) - max(c.cost) - coalesce(max(x.extra_ex), 0), 2) end as profit,
             greatest(round(sum(m.tax - m.r_tax) - coalesce(max(c.gst_paid), 0), 2), 0) as gst_to_pay,
             coalesce(max(c.uncosted), 0) as uncosted_lines
        from o m left join c on c.month = m.month left join x on x.month = m.month
       group by m.month
    ) y;

  elsif p_kind = 'gst' then
    select coalesce(jsonb_agg(x order by x.month, x.place, x.rate), '[]') into r from (
      select date_trunc('month', o.created_at at time zone 'Asia/Kolkata')::date as month,
             o.address_state as place,
             o.gst_rate as rate,
             count(*) as orders,
             sum(case when o.gst_inclusive then o.subtotal - o.tax else o.subtotal end
                 - case when o.gst_inclusive then coalesce(rt.subtotal, 0) - coalesce(rt.tax, 0) else coalesce(rt.subtotal, 0) end) as taxable,
             case when home = '' then null when o.address_state = home then 0 else sum(o.tax - coalesce(rt.tax, 0)) end as igst,
             case when home = '' then null when o.address_state = home then round(sum(o.tax - coalesce(rt.tax, 0)) / 2, 2) else 0 end as cgst,
             case when home = '' then null when o.address_state = home
                  then sum(o.tax - coalesce(rt.tax, 0)) - round(sum(o.tax - coalesce(rt.tax, 0)) / 2, 2) else 0 end as sgst,
             sum(o.tax - coalesce(rt.tax, 0)) as gst
        from public.orders o left join public.order_refund_totals rt on rt.order_id = o.id
       where o.created_at >= t0 and o.created_at < t1 and o.status not in ('cancelled', 'refunded')
       group by 1, 2, 3
    ) x;

  else
    raise exception 'Unknown report %.', p_kind using errcode = '22023';
  end if;

  return r;
end;
$$;
