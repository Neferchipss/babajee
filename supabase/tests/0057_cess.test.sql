-- Tests for migration 0057 (CESS, optional, per product).
-- Run through scripts/test-sql.sh, which wraps migration + this file in a
-- transaction that is rolled back. An empty response means every check passed.
-- (0056 must be in place first: run it with this migration, or apply it.)

do $$
declare
  adm uuid;
  cat uuid;
  prod uuid;
  v uuid;
  o uuid;
  it uuid;
  rf uuid;
  cn record;
  p jsonb;
  x record;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  if adm is null then raise exception 'FAIL: setup (no admin profile)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);

  update public.store_settings set gstin = '27AAAAA0000A1Z5', store_state = 'Maharashtra', cess_enabled = false where id = 1;

  -- the line maths: no cess is exactly the old GST
  if public.line_gst_c(118, 18, 0, true) <> public.line_gst(118, 18, true) then raise exception 'FAIL: no_cess_same_gst incl'; end if;
  if public.line_gst_c(100, 18, 0, false) <> public.line_gst(100, 18, false) then raise exception 'FAIL: no_cess_same_gst excl'; end if;
  if public.line_cess(118, 18, 0, true) <> 0 then raise exception 'FAIL: no_cess_zero'; end if;
  -- 140 incl at 28% + 12% cess = 100 + 28 + 12
  if not (public.line_gst_c(140, 28, 12, true) = 28 and public.line_cess(140, 28, 12, true) = 12) then raise exception 'FAIL: line_incl'; end if;
  if not (public.line_gst_c(100, 28, 12, false) = 28 and public.line_cess(100, 28, 12, false) = 12) then raise exception 'FAIL: line_excl'; end if;

  insert into public.categories (slug, name) values ('zz-test-0057', 'Test 0057') returning id into cat;
  insert into public.products (category_id, slug, name, gst_rate, cess_rate) values (cat, 'zz-test-0057-p', 'Test cess', 28, 12) returning id into prod;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (prod, 'One', 140, 0, false) returning id into v;

  -- switch_off_no_cess: the product has a rate, the switch is off -> none charged, total as before
  insert into public.orders (profile_id, status, contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total, gst_inclusive, is_test)
  values (adm, 'pending', 'T', 't@example.com', '9999999999', 'x', 'Pune', 'Maharashtra', '411001', 140, 0, 0, 140, true, true)
  returning id into o;
  insert into public.order_items (order_id, variant_id, product_name, variant_label, unit_price, quantity)
  values (o, v, 'Test cess', 'One', 140, 1) returning id into it;
  perform public.order_retax(o);
  if not ((select cess_rate from public.order_items where id = it) = 0) then raise exception 'FAIL: switch_off_no_cess rate'; end if;
  if not (select tax = public.line_gst(140, 28, true) and cess = 0 and total = 140 from public.orders where id = o) then
    raise exception 'FAIL: switch_off_no_cess totals %', (select row(tax, cess, total) from public.orders where id = o); end if;

  -- switch_on_inclusive: 140 incl = 100 + 28 GST + 12 cess, total stays 140
  update public.store_settings set cess_enabled = true where id = 1;
  insert into public.orders (profile_id, status, contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total, gst_inclusive, is_test)
  values (adm, 'pending', 'T', 't@example.com', '9999999999', 'x', 'Pune', 'Maharashtra', '411001', 140, 50, 0, 190, true, true)
  returning id into o;
  insert into public.order_items (order_id, variant_id, product_name, variant_label, unit_price, quantity)
  values (o, v, 'Test cess', 'One', 140, 1) returning id into it;
  perform public.order_retax(o);
  if not (select cess_rate = 12 and cess = 12 from public.order_items where id = it) then raise exception 'FAIL: switch_on_inclusive line'; end if;
  if not (select tax = 28 and cess = 12 and total = 190 from public.orders where id = o) then
    raise exception 'FAIL: switch_on_inclusive totals %', (select row(tax, cess, total) from public.orders where id = o); end if;

  -- switch_on_exclusive: 100 + 28 GST + 12 cess added = 140 (+ 50 delivery)
  insert into public.orders (profile_id, status, contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total, gst_inclusive, is_test)
  values (adm, 'pending', 'T', 't@example.com', '9999999999', 'x', 'Pune', 'Maharashtra', '411001', 100, 50, 0, 150, false, true)
  returning id into o;
  insert into public.order_items (order_id, variant_id, product_name, variant_label, unit_price, quantity)
  values (o, v, 'Test cess', 'One', 100, 1) returning id into it;
  perform public.order_retax(o);
  if not (select tax = 28 and cess = 12 and total = 190 from public.orders where id = o) then
    raise exception 'FAIL: switch_on_exclusive totals %', (select row(tax, cess, total) from public.orders where id = o); end if;

  -- refund_keeps_cess: the inclusive order, invoiced, the item refunded in full
  -- -> refund and credit note carry 28 GST and 12 cess
  select id into o from public.orders where gst_inclusive and is_test and subtotal = 140 and shipping = 50 and profile_id = adm order by created_at desc limit 1;
  select id into it from public.order_items where order_id = o;
  update public.orders set status = 'paid', paid_total = 190 where id = o;
  set constraints all immediate;
  set constraints all deferred;
  if (select invoice_number from public.orders where id = o) is null then raise exception 'FAIL: refund setup (not invoiced)'; end if;
  perform public.admin_refund(o, jsonb_build_array(jsonb_build_object('item', it, 'qty', 1)), 0, 140, false, false, 'test');
  set constraints all immediate;
  set constraints all deferred;
  select f.id into rf from public.order_refunds f where f.order_id = o;
  if not (select tax = 28 and cess = 12 and subtotal = 140 from public.order_refunds where id = rf) then
    raise exception 'FAIL: refund_keeps_cess refund %', (select row(tax, cess, subtotal) from public.order_refunds where id = rf); end if;
  select * into cn from public.credit_notes where refund_id = rf;
  if not (cn.tax = 28 and cn.cess = 12 and cn.amount = 140) then raise exception 'FAIL: refund_keeps_cess credit note % %', cn.tax, cn.cess; end if;
  if public.refund_tax(rf) <> 28 then raise exception 'FAIL: refund_tax_still_gst'; end if;

  -- refund_taxes_gives_both
  x := public.refund_taxes(rf);
  if not (x.gst = 28 and x.cess = 12) then raise exception 'FAIL: refund_taxes whole'; end if;

  -- profit_without_cess: the exclusive order sold at 100 net; cost 50 typed
  -- (GST paid at 28% = 14) -> kept 100 - (64 - 14) = 50 with credit on
  update public.store_settings set gst_input_credit = true where id = 1;
  insert into public.variant_costs (variant_id, cost, purchase) values (v, 0, 50)
    on conflict (variant_id) do update set purchase = 50, supplier_gst_rate = null, supplier_gst = null, gst_source = 'typed';
  select id into o from public.orders where not gst_inclusive and is_test and subtotal = 100 and profile_id = adm order by created_at desc limit 1;
  update public.orders set created_at = '2001-02-03 12:00+05:30' where id = o;
  p := public.admin_profit('2001-02-03', '2001-02-03');
  if not ((p ->> 'net_sales')::numeric = 100 and (p ->> 'sales')::numeric = 140 and (p ->> 'cess_collected')::numeric = 12
          and (p ->> 'gst_collected')::numeric = 28 and (p ->> 'kept')::numeric = 50) then
    raise exception 'FAIL: profit_without_cess %', p; end if;
end $$;
