-- An order taken by the shop (phone, WhatsApp, the counter) rather than at
-- the checkout. Same order as a customer's: priced from the catalogue (or a
-- price the admin types for that line), GST by the store rule, tracked
-- stock counted down, cost snapshotted. It can belong to an existing
-- customer or to nobody (a guest); it can start unpaid or already paid.
--
-- p_lines:   [{ "variant": "<variant id>", "qty": 2, "price": 450 (optional) }]
-- p_contact: { name, phone, email }
-- p_address: { line1, line2, landmark, city, state, pincode, latitude, longitude }
-- p_shipping: delivery charge, or null for the store rule (free over the limit)
--
-- Depends on 0013, 0015, 0017. Safe to re-run.

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
