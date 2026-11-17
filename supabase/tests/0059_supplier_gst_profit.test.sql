-- Tests for migration 0059 (claimable GST, typed GST amount, profit lines).
-- Needs 0057 in place (it is on the live project). Run through
-- scripts/test-sql.sh: one transaction, rolled back. Empty response: passed.

do $$
declare
  adm uuid;
  cat uuid;
  prod uuid;
  v1 uuid; v2 uuid; v4 uuid;
  s_reg uuid; s_unreg uuid;
  c record;
  p jsonb;
  oid uuid;
  iid uuid;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  if adm is null then raise exception 'FAIL: setup (no admin profile)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  update public.store_settings set gstin = '27AAAAA0000A1Z5', gst_input_credit = true where id = 1;

  insert into public.categories (slug, name) values ('zz-test-0059', 'Test 0059') returning id into cat;
  insert into public.products (category_id, slug, name, gst_rate) values (cat, 'zz-test-0059-p', 'Test 0059', 18) returning id into prod;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (prod, 'V1', 118, 0, false) returning id into v1;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (prod, 'V2', 118, 0, false) returning id into v2;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (prod, 'V4', 118, 0, false) returning id into v4;

  -- typed_rate: supplier charged 12% though it sells at 18%; all claimable
  perform public.admin_set_purchase(v1, 60, 12, 'typed');
  select * into c from public.variant_costs where variant_id = v1;
  if not (c.gst_paid = 7.20 and c.gst_claimable = 7.20 and c.cost = 67.20) then
    raise exception 'FAIL: typed_rate (% % %)', c.gst_paid, c.gst_claimable, c.cost; end if;

  -- typed_amount_wins: the bill's exact amount over the rate
  perform public.admin_set_purchase(v2, 60, 12, 'typed', 7.25);
  select * into c from public.variant_costs where variant_id = v2;
  if not (c.gst_paid = 7.25 and c.cost = 67.25) then raise exception 'FAIL: typed_amount_wins (% %)', c.gst_paid, c.cost; end if;
  if not exists (select 1 from public.purchase_corrections where variant_id = v2 and gst_paid = 7.25) then raise exception 'FAIL: amount_kept_in_corrections'; end if;

  -- old_call_still_works: 0057's four named arguments
  perform public.admin_set_purchase(p_variant => v2, p_purchase => 50, p_gst_rate => null, p_reason => 'four args');
  if not ((select purchase from public.variant_costs where variant_id = v2) = 50) then raise exception 'FAIL: old_call_still_works'; end if;

  -- bills_average_claimable: 10 from a registered supplier at 12% (claimable),
  -- then 10 from an unregistered one at 18% (not)
  s_reg := public.admin_save_supplier(jsonb_build_object('name', 'Zz 0059 Registered', 'gstin', '27BBBBB1111B1Z5'));
  s_unreg := public.admin_save_supplier(jsonb_build_object('name', 'Zz 0059 Unregistered'));
  perform public.admin_post_receipt('bill', s_reg, 'ZZ59-1', current_date, '',
    jsonb_build_array(jsonb_build_object('variant_id', v4, 'qty', 10, 'unit_price', 100, 'gst_rate', 12)));
  select * into c from public.variant_costs where variant_id = v4;
  if not (c.purchase = 100 and c.gst_paid = 12 and c.gst_claimable = 12 and c.cost = 112) then
    raise exception 'FAIL: bills_first (% % % %)', c.purchase, c.gst_paid, c.gst_claimable, c.cost; end if;
  perform public.admin_post_receipt('bill', s_unreg, 'ZZ59-2', current_date, '',
    jsonb_build_array(jsonb_build_object('variant_id', v4, 'qty', 10, 'unit_price', 100, 'gst_rate', 18)));
  select * into c from public.variant_costs where variant_id = v4;
  -- (10 x 12 + 10 x 18) / 20 = 15 paid; (10 x 12 + 0) / 20 = 6 claimable
  if not (c.gst_paid = 15 and c.gst_claimable = 6 and c.cost = 115) then
    raise exception 'FAIL: bills_average_claimable (% % %)', c.gst_paid, c.gst_claimable, c.cost; end if;

  -- correction_resets_claimable: a typed correction counts all its GST
  perform public.admin_set_purchase(v4, 100, 18, 'recount');
  if not ((select gst_claimable from public.variant_costs where variant_id = v4) = 18) then raise exception 'FAIL: correction_resets_claimable'; end if;
  -- back to the bills' figures for the sale below
  update public.variant_costs set purchase = 100, gst_paid = 15, gst_claimable = 6 where variant_id = v4;

  -- sale_keeps_claimable: a paid sale freezes unit_gst (0057) and unit_itc
  insert into public.orders (profile_id, status, contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total, gst_inclusive, paid_total)
  values (adm, 'paid', 'T', 't@example.com', '9999999999', 'x', 'Pune', 'Maharashtra', '411001', 118, 0, 18, 118, true, 118)
  returning id into oid;
  insert into public.order_items (order_id, variant_id, product_name, variant_label, unit_price, quantity, gst_rate)
  values (oid, v4, 'Test 0059', 'V4', 118, 1, 18) returning id into iid;
  insert into public.order_item_costs (order_item_id, unit_cost) values (iid, 115);
  if not (select unit_gst = 15 and unit_itc = 6 from public.order_item_costs where order_item_id = iid) then
    raise exception 'FAIL: sale_keeps_claimable (%)', (select row(unit_gst, unit_itc) from public.order_item_costs where order_item_id = iid); end if;

  -- profit_claims_only_claimable: net 100, cost 115 incl 15 paid, 6 claimable
  -- -> kept 100 - (115 - 6) = -9; without the claim -15; owed 18 - 6 = 12
  update public.orders set created_at = '2001-01-01 12:00+05:30' where id = oid;
  p := public.admin_profit('2001-01-01', '2001-01-01');
  if not ((p ->> 'gst_paid')::numeric = 15 and (p ->> 'itc')::numeric = 6 and (p ->> 'kept')::numeric = -9
          and (p ->> 'kept_no_itc')::numeric = -15 and (p ->> 'gst_owed')::numeric = 12) then
    raise exception 'FAIL: profit_claims_only_claimable %', p; end if;

  -- credit_off_claims_nothing
  update public.store_settings set gst_input_credit = false where id = 1;
  p := public.admin_profit('2001-01-01', '2001-01-01');
  if not ((p ->> 'itc')::numeric = 0 and (p ->> 'kept')::numeric = -15 and (p ->> 'gst_owed')::numeric = 18) then
    raise exception 'FAIL: credit_off_claims_nothing %', p; end if;

  -- unpaid_not_counted (0057's rule kept): a pending order isn't a sale
  update public.orders set status = 'pending' where id = oid;
  p := public.admin_profit('2001-01-01', '2001-01-01');
  if (p ->> 'lines')::int <> 0 then raise exception 'FAIL: unpaid_not_counted %', p; end if;
end $$;
