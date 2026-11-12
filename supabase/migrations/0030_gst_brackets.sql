-- GST brackets per product, purchase price + GST = cost, and the client's
-- profit rule.
--
-- 1. Each product sits in a GST bracket: 0, 5, 12, 18, 28 or 40%. Empty means
--    the store's default rate (Settings). An HSN code is optional, for the
--    invoice.
-- 2. Each order line keeps the bracket it sold at (order_items.gst_rate), so
--    one order can mix brackets. The order's tax is the sum of its lines;
--    orders.gst_rate is now the one rate all lines share, or null when mixed.
-- 3. Cost: the shop types the purchase price (before GST); the cost price is
--    purchase + GST at the product's bracket, kept up to date when the
--    bracket changes. variant_costs.cost stays "cost with GST", as before.
-- 4. Profit, as the client counts it:
--        profit = selling price (with GST) - cost price (with GST)
--    The GST still owed to the government is shown beside it:
--        GST to pay = GST collected - GST paid on purchases (if claimed back)
--        kept       = profit - GST to pay
-- 5. admin_units_sold(): units each product has sold, all time.
--
-- Depends on 0015, 0017, 0018. Safe to re-run.

-- ---------------------------------------------------------------- 1. brackets

alter table public.products add column if not exists gst_rate numeric(5, 2);
alter table public.products drop constraint if exists products_gst_bracket;
alter table public.products add constraint products_gst_bracket
  check (gst_rate is null or gst_rate in (0, 5, 12, 18, 28, 40));
alter table public.products add column if not exists hsn text not null default '';
alter table public.products drop constraint if exists products_hsn_format;
alter table public.products add constraint products_hsn_format check (hsn ~ '^([0-9]{4}|[0-9]{6}|[0-9]{8})?$');

-- the bracket a product sells at today
create or replace function public.product_gst(p_product uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce((select p.gst_rate from public.products p where p.id = p_product),
                  (select st.gst_rate from public.store_settings st where st.id = 1), 0)
$$;

-- ---------------------------------------------------------------- 2. lines keep their bracket

alter table public.order_items add column if not exists gst_rate numeric(5, 2);
update public.order_items i set gst_rate = o.gst_rate
  from public.orders o where o.id = i.order_id and i.gst_rate is null;

create or replace function public.order_items_set_gst()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.gst_rate is null then
    new.gst_rate := coalesce(
      (select public.product_gst(pv.product_id) from public.product_variants pv where pv.id = new.variant_id),
      (select st.gst_rate from public.store_settings st where st.id = 1), 0);
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_set_gst on public.order_items;
create trigger order_items_set_gst
  before insert on public.order_items
  for each row execute function public.order_items_set_gst();

alter table public.order_items alter column gst_rate set not null;
alter table public.orders alter column gst_rate drop not null;

-- GST on a line worth `gross` at the shelf price
create or replace function public.line_gst(gross numeric, rate numeric, incl boolean)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when incl then round(gross * rate / (100 + rate), 2) else round(gross * rate / 100, 2) end
$$;

-- an order's tax and total from its lines (subtotal and shipping as they are)
create or replace function public.order_retax(p_order uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t numeric;
  one numeric;
begin
  select coalesce(sum(public.line_gst(i.quantity * i.unit_price, i.gst_rate, o.gst_inclusive)), 0),
         case when count(distinct i.gst_rate) = 1 then max(i.gst_rate) end
    into t, one
    from public.orders o join public.order_items i on i.order_id = o.id
   where o.id = p_order;
  update public.orders
     set tax = coalesce(t, 0),
         total = subtotal + shipping + case when gst_inclusive then 0 else coalesce(t, 0) end,
         gst_rate = one
   where id = p_order;
end;
$$;
revoke all on function public.order_retax(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. purchase price -> cost

alter table public.variant_costs add column if not exists purchase numeric(10, 2) check (purchase is null or purchase >= 0);

create or replace function public.variant_costs_from_purchase()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.purchase is not null then
    new.cost := round(new.purchase * (100 + coalesce(
      (select public.product_gst(pv.product_id) from public.product_variants pv where pv.id = new.variant_id), 0)) / 100, 2);
  end if;
  return new;
end;
$$;

drop trigger if exists variant_costs_from_purchase on public.variant_costs;
create trigger variant_costs_from_purchase
  before insert or update on public.variant_costs
  for each row execute function public.variant_costs_from_purchase();

-- a bracket changed: costs typed as a purchase price follow it
create or replace function public.recost_on_bracket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'products' then
    update public.variant_costs vc set purchase = vc.purchase
      from public.product_variants pv
     where pv.id = vc.variant_id and pv.product_id = new.id and vc.purchase is not null;
  else
    update public.variant_costs vc set purchase = vc.purchase
      from public.product_variants pv join public.products p on p.id = pv.product_id
     where pv.id = vc.variant_id and p.gst_rate is null and vc.purchase is not null;
  end if;
  return null;
end;
$$;

drop trigger if exists products_recost on public.products;
create trigger products_recost
  after update of gst_rate on public.products
  for each row when (old.gst_rate is distinct from new.gst_rate)
  execute function public.recost_on_bracket();
drop trigger if exists store_settings_recost on public.store_settings;
create trigger store_settings_recost
  after update of gst_rate on public.store_settings
  for each row when (old.gst_rate is distinct from new.gst_rate)
  execute function public.recost_on_bracket();

-- ---------------------------------------------------------------- 4. checkout, create, edit, refund
-- (copied from 0015 / 0018 / 0017; the changes are marked with comments)

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

  -- GST from each line's own bracket
  perform public.order_retax(o_id);

  return query select o_id, o_no;
end;
$$;

revoke all on function public.place_order(jsonb, jsonb, text) from public, anon;
grant execute on function public.place_order(jsonb, jsonb, text) to authenticated;

create or replace function public.admin_create_order(
  p_customer uuid,
  p_contact jsonb,
  p_address jsonb,
  p_lines jsonb,
  p_shipping numeric default null,
  p_notes text default '',
  p_paid boolean default false)
returns table (order_id uuid, order_number text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  ln jsonb;
  v record;
  n int;
  price numeric(10, 2);
  sub numeric(10, 2) := 0;
  ship numeric(10, 2);
  tax numeric(10, 2);
  s record;
  o_id uuid;
  o_no text;
  oi_id uuid;
  lines jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can create an order.' using errcode = '42501';
  end if;
  if p_customer is not null and not exists (select 1 from public.profiles where id = p_customer) then
    raise exception 'That customer no longer exists.';
  end if;
  if coalesce(trim(p_contact ->> 'name'), '') = '' or coalesce(trim(p_contact ->> 'phone'), '') = '' then
    raise exception 'Add the customer''s name and phone number.';
  end if;
  if coalesce(trim(p_address ->> 'line1'), '') = '' or coalesce(trim(p_address ->> 'city'), '') = ''
     or coalesce(trim(p_address ->> 'state'), '') = '' or coalesce(trim(p_address ->> 'pincode'), '') = '' then
    raise exception 'Add a full delivery address.';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item.';
  end if;
  if jsonb_array_length(p_lines) > 50 then
    raise exception 'Too many lines in one order.';
  end if;

  for ln in select * from jsonb_array_elements(p_lines) loop
    n := coalesce((ln ->> 'qty')::int, 0);
    if n < 1 or n > 99 then
      raise exception 'Quantities must be between 1 and 99.';
    end if;
    select pv.id, pv.label, pv.sku, pv.price, pv.stock_qty, pv.track_stock, p.name,
           (select vc.cost from public.variant_costs vc where vc.variant_id = pv.id) as cost
      into v
      from public.product_variants pv join public.products p on p.id = pv.product_id
     where pv.id = (ln ->> 'variant')::uuid
       for update of pv;
    if v.id is null then
      raise exception 'A product on this order no longer exists.';
    end if;
    price := round(coalesce(nullif(ln ->> 'price', '')::numeric, v.price), 2);
    if price <= 0 then
      raise exception '% has no price. Type one for this order.', v.name;
    end if;
    if v.track_stock and v.stock_qty < n then
      raise exception 'Only % of % in stock.', v.stock_qty, v.name;
    end if;
    sub := sub + price * n;
    lines := lines || jsonb_build_object(
      'variant_id', v.id, 'name', v.name, 'label', case when v.label = 'Default' then '' else v.label end,
      'sku', v.sku, 'price', price, 'qty', n, 'track', v.track_stock, 'cost', v.cost);
  end loop;

  select st.shipping, st.free_shipping_over, st.gst_rate, st.gst_inclusive into s from public.store_settings st where st.id = 1;
  ship := coalesce(round(p_shipping, 2),
                   case when s.free_shipping_over is not null and sub >= s.free_shipping_over then 0 else coalesce(s.shipping, 0) end);
  if ship < 0 then
    raise exception 'Delivery cannot be negative.';
  end if;
  tax := case when coalesce(s.gst_inclusive, true) then round(sub * coalesce(s.gst_rate, 0) / (100 + coalesce(s.gst_rate, 0)), 2)
              else round(sub * coalesce(s.gst_rate, 0) / 100, 2) end;

  insert into public.orders (
    profile_id, contact_name, contact_email, contact_phone,
    address_line1, address_line2, address_landmark, address_city, address_state, address_pincode,
    address_latitude, address_longitude, subtotal, shipping, tax, total, notes, gst_rate, gst_inclusive)
  values (
    p_customer, trim(p_contact ->> 'name'), coalesce(trim(p_contact ->> 'email'), ''), trim(p_contact ->> 'phone'),
    trim(p_address ->> 'line1'), coalesce(trim(p_address ->> 'line2'), ''), coalesce(trim(p_address ->> 'landmark'), ''),
    trim(p_address ->> 'city'), trim(p_address ->> 'state'), trim(p_address ->> 'pincode'),
    nullif(p_address ->> 'latitude', '')::double precision, nullif(p_address ->> 'longitude', '')::double precision,
    sub, ship, tax, sub + ship + case when coalesce(s.gst_inclusive, true) then 0 else tax end,
    left(coalesce(p_notes, ''), 1000), coalesce(s.gst_rate, 0), coalesce(s.gst_inclusive, true))
  returning id, orders.order_number into o_id, o_no;

  -- the insert trigger wrote "Order placed"; say who placed it
  update public.order_events set note = 'Created by the shop', actor_id = (select auth.uid())
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

  -- GST from each line's own bracket (before "paid" fixes what was paid)
  perform public.order_retax(o_id);

  if p_paid then
    -- through the status trigger, so paid_total and the timeline are set as usual
    perform set_config('babajee.event_note', 'Paid when the order was taken', true);
    update public.orders set status = 'paid' where id = o_id;
    perform set_config('babajee.event_note', '', true);
  end if;

  return query select o_id, o_no;
end;
$$;

revoke all on function public.admin_create_order(uuid, jsonb, jsonb, jsonb, numeric, text, boolean) from public, anon;
grant execute on function public.admin_create_order(uuid, jsonb, jsonb, jsonb, numeric, text, boolean) to authenticated;

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
  -- each line at its own bracket; a line added now takes the product's bracket today
  select coalesce(sum(public.line_gst(quantity * unit_price, gst_rate, o.gst_inclusive)), 0) into tx
    from public.order_items where order_id = p_order;
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
  perform public.order_retax(p_order);

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

  -- the item part, split into its own value and GST in the order's own
  -- proportion (lines can sit in different GST brackets)
  rest := p_amount - p_shipping;
  if o.gst_inclusive then
    sub := rest;
    tx := case when o.subtotal > 0 then round(rest * o.tax / o.subtotal, 2) else 0 end;
  else
    sub := case when o.subtotal + o.tax > 0 then round(rest * o.subtotal / (o.subtotal + o.tax), 2) else rest end;
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

-- ---------------------------------------------------------------- 5. profit

-- Per line, at the line's own bracket:
--   sale  = one unit's price with GST (what the customer paid for it)
--   cost  = cost price with GST
--   profit (client's rule) = kept units x sale - units gone x cost
--   kept  (after GST)      = sale without GST - cost (without its GST only
--                            when that GST is claimed back), i.e. what the
--                            shop keeps once GST is paid
-- A refund's value beyond the items it names ("extra") comes off at order level.
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
           case when o.gst_inclusive then i.unit_price else i.unit_price * (100 + i.gst_rate) / 100 end as sale,
           case when o.gst_inclusive then i.unit_price * 100 / (100 + i.gst_rate) else i.unit_price end as net,
           coalesce(c.unit_cost, vc.cost) as cost,
           i.gst_rate as rate
      from o
      join public.order_items i on i.order_id = o.id
      left join public.order_item_refunded ir on ir.order_item_id = i.id
      left join public.order_item_costs c on c.order_item_id = i.id
      left join public.variant_costs vc on vc.variant_id = i.variant_id
  ),
  m as (
    select l.*,
           cost * rate / (100 + rate) as cost_gst,
           case when cost is null then null
                when credit then cost * 100 / (100 + rate) else cost end as cost_kept
      from l
  ),
  -- goodwill / amount-only refunds per order, with and without GST
  x as (
    select o.id as order_id, (o.created_at at time zone 'Asia/Kolkata')::date as day,
           o.extra * case when o.gst_inclusive or o.subtotal = 0 then 1 else (o.subtotal + o.tax) / o.subtotal end as extra_g,
           o.extra * case when o.gst_inclusive and o.subtotal > 0 then (o.subtotal - o.tax) / o.subtotal else 1 end as extra_ex,
           not exists (select 1 from m where m.order_id = o.id and m.cost is null) as costed
      from o where o.extra <> 0
  ),
  days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  )
  select jsonb_build_object(
    'input_credit', credit,
    'sales', (select round(coalesce(sum(q * sale), 0) - coalesce((select sum(extra_g) from x), 0), 2) from m),
    'net_sales', (select round(coalesce(sum(q * net), 0) - coalesce((select sum(extra_ex) from x), 0), 2) from m),
    'costed_sales', (select round(coalesce(sum(q * sale), 0) - coalesce((select sum(extra_g) from x where costed), 0), 2) from m where cost is not null),
    'cost', (select round(coalesce(sum(gone * cost), 0), 2) from m),
    'profit', (select round(coalesce(sum(q * sale - gone * cost), 0) - coalesce((select sum(extra_g) from x where costed), 0), 2) from m where cost is not null),
    'kept', (select round(coalesce(sum(q * net - gone * cost_kept), 0) - coalesce((select sum(extra_ex) from x where costed), 0), 2) from m where cost is not null),
    'uncosted_lines', (select count(*) from m where cost is null and gone > 0),
    'lines', (select count(*) from m where gone > 0),
    'gst_collected', (select coalesce(sum(tax - r_tax), 0) from o),
    'gst_on_top', (select coalesce(sum(tax - r_tax), 0) from o where not gst_inclusive),
    -- GST inside the cost of what was sold (claimed back only when credit is on)
    'gst_paid', (select round(coalesce(sum(gone * cost_gst), 0), 2) from m where cost is not null),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', days.day, 'profit', round(coalesce(a.p, 0) - coalesce(b.e, 0), 2)) order by days.day), '[]')
        from days
        left join (select day, sum(q * sale - gone * cost) as p from m where cost is not null group by day) a on a.day = days.day
        left join (select day, sum(extra_g) as e from x where costed group by day) b on b.day = days.day),
    'top', (
      select coalesce(jsonb_agg(t), '[]') from (
        select product_name as name, sum(q) as qty, round(sum(q * sale), 2) as sales,
               round(sum(q * sale - gone * cost), 2) as profit
          from m where cost is not null
         group by product_name
        having sum(gone) > 0
         order by 4 desc limit 8) t)
  ) into r;
  return r;
end;
$$;

revoke all on function public.admin_profit(date, date) from public, anon;
grant execute on function public.admin_profit(date, date) to authenticated;

-- ---------------------------------------------------------------- 6. reports

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
      select i.product_name, i.variant_label, i.quantity as qty, i.unit_price as price, i.gst_rate as rate,
             i.quantity - coalesce(ir.qty, 0) as q,
             i.quantity - coalesce(ir.restocked, 0) as gone,
             coalesce(ir.qty, 0) as back,
             case when o.gst_inclusive then i.unit_price else i.unit_price * (100 + i.gst_rate) / 100 end as sale,
             case when o.gst_inclusive then i.unit_price * 100 / (100 + i.gst_rate) else i.unit_price end as net,
             coalesce(c.unit_cost, vc.cost) as cost
        from o
        join public.order_items i on i.order_id = o.id
        left join public.order_item_refunded ir on ir.order_item_id = i.id
        left join public.order_item_costs c on c.order_item_id = i.id
        left join public.variant_costs vc on vc.variant_id = i.variant_id
    )
    select coalesce(jsonb_agg(x order by x.gross desc, x.product), '[]') into r from (
      select product_name as product,
             variant_label as option,
             max(rate) as gst_rate,
             sum(q) as sold,
             sum(qty * price) as gross,
             sum(back * price) as returns,
             sum(q * price) as net,
             round(sum(q * sale), 2) as sales,
             round(sum(q * net), 2) as sales_ex_gst,
             case when bool_and(cost is not null) then round(sum(gone * cost), 2) end as cost,
             case when bool_and(cost is not null) then round(sum(q * sale - gone * cost), 2) end as profit
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
             case when o.gst_inclusive then i.unit_price else i.unit_price * (100 + i.gst_rate) / 100 end as sale,
             coalesce(oc.unit_cost, vc.cost) as cost, i.gst_rate as rate
        from o
        join public.order_items i on i.order_id = o.id
        left join public.order_item_refunded ir on ir.order_item_id = i.id
        left join public.order_item_costs oc on oc.order_item_id = i.id
        left join public.variant_costs vc on vc.variant_id = i.variant_id
    ),
    c as (
      select month,
             sum(gone * cost) as cost,
             sum(gone * cost * rate / (100 + rate)) filter (where credit) as gst_paid,
             sum(q * sale) filter (where cost is not null) as costed_sales,
             count(*) filter (where cost is null and gone > 0) as uncosted
        from l group by month
    ),
    x as (
      select o.month, sum(o.extra * case when o.gst_inclusive or o.subtotal = 0 then 1 else (o.subtotal + o.tax) / o.subtotal end) as extra_g
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
             case when max(c.costed_sales) is not null then round(max(c.costed_sales) - max(c.cost) - coalesce(max(x.extra_g), 0), 2) end as profit,
             greatest(round(sum(m.tax - m.r_tax) - coalesce(max(c.gst_paid), 0), 2), 0) as gst_to_pay,
             coalesce(max(c.uncosted), 0) as uncosted_lines
        from o m left join c on c.month = m.month left join x on x.month = m.month
       group by m.month
    ) y;

  elsif p_kind = 'gst' then
    -- per line at its own bracket; each order's lines are scaled so they add
    -- up to the GST the order kept after refunds
    with o as (
      select o.*, coalesce(rt.tax, 0) as r_tax
        from public.orders o left join public.order_refund_totals rt on rt.order_id = o.id
       where o.created_at >= t0 and o.created_at < t1 and o.status not in ('cancelled', 'refunded')
    ),
    l as (
      select o.id as order_id, date_trunc('month', o.created_at at time zone 'Asia/Kolkata')::date as month,
             o.address_state as place, i.gst_rate as rate, o.tax - o.r_tax as order_gst,
             public.line_gst((i.quantity - coalesce(ir.qty, 0)) * i.unit_price, i.gst_rate, o.gst_inclusive) as g,
             (i.quantity - coalesce(ir.qty, 0)) * i.unit_price as gross,
             o.gst_inclusive as incl
        from o
        join public.order_items i on i.order_id = o.id
        left join public.order_item_refunded ir on ir.order_item_id = i.id
    ),
    s as (
      select l.*, case when sum(g) over (partition by order_id) > 0 then order_gst / sum(g) over (partition by order_id) else 0 end as f
        from l
    ),
    y as (
      select month, place, rate,
             count(distinct order_id) as orders,
             round(sum(case when incl then gross - g else gross end * case when f > 0 then f else 1 end), 2) as taxable,
             round(sum(g * f), 2) as gst
        from s group by 1, 2, 3
    )
    select coalesce(jsonb_agg(x order by x.month, x.place, x.rate), '[]') into r from (
      select month, place, rate, orders, taxable,
             case when home = '' then null when place = home then 0 else gst end as igst,
             case when home = '' then null when place = home then round(gst / 2, 2) else 0 end as cgst,
             case when home = '' then null when place = home then gst - round(gst / 2, 2) else 0 end as sgst,
             gst
        from y
    ) x;

  else
    raise exception 'Unknown report %.', p_kind using errcode = '22023';
  end if;

  return r;
end;
$$;

revoke all on function public.admin_report(text, date, date) from public, anon;
grant execute on function public.admin_report(text, date, date) to authenticated;

-- ---------------------------------------------------------------- 7. units sold

-- per product, all time: units customers kept (cancelled orders and refunded
-- units left out)
create or replace function public.admin_units_sold()
returns table (product_id uuid, units bigint)
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
    select pv.product_id, sum(i.quantity - coalesce(ir.qty, 0))::bigint
      from public.order_items i
      join public.orders o on o.id = i.order_id and o.status <> 'cancelled'
      join public.product_variants pv on pv.id = i.variant_id
      left join public.order_item_refunded ir on ir.order_item_id = i.id
     group by pv.product_id;
end;
$$;

revoke all on function public.admin_units_sold() from public, anon;
grant execute on function public.admin_units_sold() to authenticated;
