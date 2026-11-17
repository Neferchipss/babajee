-- Tests for migration 0056 (GST paid to the supplier, the rebate, profit).
-- Run through scripts/test-sql.sh, which wraps migration + this file in a
-- transaction that is rolled back. An empty response means every check passed.

do $$
declare
  adm uuid;
  cat uuid;
  prod uuid;
  v1 uuid; v2 uuid; v3 uuid; v4 uuid; v5 uuid;
  s_reg uuid; s_unreg uuid;
  r1 uuid; r2 uuid;
  c record;
  p jsonb;
  oid uuid;
  iid uuid;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  if adm is null then raise exception 'FAIL: setup (no admin profile)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  if not public.is_admin() then raise exception 'FAIL: setup (is_admin false)'; end if;

  update public.store_settings set gstin = '27AAAAA0000A1Z5', gst_input_credit = true where id = 1;

  insert into public.categories (slug, name) values ('zz-test-0056', 'Test 0056') returning id into cat;
  -- sold at 18%
  insert into public.products (category_id, slug, name, gst_rate) values (cat, 'zz-test-0056-p', 'Test 0056', 18) returning id into prod;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (prod, 'V1', 118, 0, false) returning id into v1;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (prod, 'V2', 118, 0, false) returning id into v2;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (prod, 'V3', 118, 0, false) returning id into v3;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (prod, 'V4', 118, 0, false) returning id into v4;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (prod, 'V5', 118, 0, false) returning id into v5;

  -- typed_default_rate: no supplier rate typed -> the product's 18%
  insert into public.variant_costs (variant_id, cost, purchase) values (v1, 0, 60);
  select * into c from public.variant_costs where variant_id = v1;
  if not (c.gst_paid = 10.80 and c.gst_claimable = 10.80 and c.cost = 70.80 and c.gst_source = 'typed') then
    raise exception 'FAIL: typed_default_rate (% / % / %)', c.gst_paid, c.gst_claimable, c.cost; end if;

  -- typed_supplier_rate: supplier charged 12% though it sells at 18%
  insert into public.variant_costs (variant_id, cost, purchase, supplier_gst_rate) values (v2, 0, 60, 12);
  select * into c from public.variant_costs where variant_id = v2;
  if not (c.gst_paid = 7.20 and c.cost = 67.20) then raise exception 'FAIL: typed_supplier_rate (% / %)', c.gst_paid, c.cost; end if;

  -- typed_amount_wins: an amount typed beats the rate
  insert into public.variant_costs (variant_id, cost, purchase, supplier_gst_rate, supplier_gst) values (v3, 0, 60, 12, 7.25);
  select * into c from public.variant_costs where variant_id = v3;
  if not (c.gst_paid = 7.25 and c.cost = 67.25) then raise exception 'FAIL: typed_amount_wins (% / %)', c.gst_paid, c.cost; end if;

  -- bracket_change_follows_typed_default: v1 had no supplier rate, so it follows the product
  update public.products set gst_rate = 5 where id = prod;
  if not ((select gst_paid from public.variant_costs where variant_id = v1) = 3.00) then raise exception 'FAIL: bracket_change_follows_typed_default'; end if;
  if not ((select gst_paid from public.variant_costs where variant_id = v2) = 7.20) then raise exception 'FAIL: bracket_change_keeps_typed_rate'; end if;
  update public.products set gst_rate = 18 where id = prod;

  -- bills_average_gst_and_claimable: 10 from a registered supplier at 12%
  -- (claimable), then 10 from an unregistered one at 18% (not claimable)
  s_reg := public.admin_save_supplier(jsonb_build_object('name', 'Zz Registered', 'gstin', '27BBBBB1111B1Z5'));
  s_unreg := public.admin_save_supplier(jsonb_build_object('name', 'Zz Unregistered'));
  r1 := public.admin_post_receipt('bill', s_reg, 'ZZ-1', current_date, '',
    jsonb_build_array(jsonb_build_object('variant_id', v4, 'qty', 10, 'unit_price', 100, 'gst_rate', 12)));
  select * into c from public.variant_costs where variant_id = v4;
  if not (c.gst_source = 'bills' and c.purchase = 100 and c.gst_paid = 12.00 and c.gst_claimable = 12.00 and c.cost = 112.00) then
    raise exception 'FAIL: bills_first (% % % % %)', c.gst_source, c.purchase, c.gst_paid, c.gst_claimable, c.cost; end if;
  r2 := public.admin_post_receipt('bill', s_unreg, 'ZZ-2', current_date, '',
    jsonb_build_array(jsonb_build_object('variant_id', v4, 'qty', 10, 'unit_price', 100, 'gst_rate', 18)));
  select * into c from public.variant_costs where variant_id = v4;
  -- (10 x 12 + 10 x 18) / 20 = 15 paid; (10 x 12 + 0) / 20 = 6 claimable
  if not (c.gst_paid = 15.00 and c.gst_claimable = 6.00 and c.cost = 115.00) then
    raise exception 'FAIL: bills_average_gst_and_claimable (% / % / %)', c.gst_paid, c.gst_claimable, c.cost; end if;

  -- bracket_change_leaves_bills_alone
  update public.products set gst_rate = 5 where id = prod;
  if not ((select gst_paid from public.variant_costs where variant_id = v4) = 15.00) then raise exception 'FAIL: bracket_change_leaves_bills_alone'; end if;
  update public.products set gst_rate = 18 where id = prod;

  -- void_last_bills_back_to_typed: v5 gets one bill, voided
  r1 := public.admin_post_receipt('bill', s_reg, 'ZZ-3', current_date, '',
    jsonb_build_array(jsonb_build_object('variant_id', v5, 'qty', 2, 'unit_price', 50, 'gst_rate', 12)));
  if not ((select gst_source from public.variant_costs where variant_id = v5) = 'bills') then raise exception 'FAIL: void setup'; end if;
  perform public.admin_void_receipt(r1);
  select * into c from public.variant_costs where variant_id = v5;
  if not (c.gst_source = 'typed' and c.gst_paid = round(c.purchase * 18 / 100, 2)) then
    raise exception 'FAIL: void_last_bills_back_to_typed (% / % / %)', c.gst_source, c.purchase, c.gst_paid; end if;

  -- sale_snapshots_gst: a sold line keeps the GST paid and claimable at sale
  insert into public.orders (profile_id, status, contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total, gst_inclusive, is_test)
  values (adm, 'pending', 'T', 't@example.com', '9999999999', 'x', 'Pune', 'Maharashtra', '411001', 118, 0, 18, 118, true, true)
  returning id into oid;
  insert into public.order_items (order_id, variant_id, product_name, variant_label, unit_price, quantity, gst_rate)
  values (oid, v4, 'Test 0056', 'V4', 118, 1, 18) returning id into iid;
  insert into public.order_item_costs (order_item_id, unit_cost) values (iid, 115);
  if not (select unit_gst = 15.00 and unit_itc = 6.00 from public.order_item_costs where order_item_id = iid) then
    raise exception 'FAIL: sale_snapshots_gst'; end if;

  -- profit_uses_paid_and_claimable: sale 118 incl 18% -> net 100; cost 115
  -- incl 15 GST paid; claimed back 6 -> kept = 100 - (115 - 6) = -9;
  -- without the claim: 100 - 115 = -15; GST owed = 18 collected - 6 = 12
  -- isolate this order's figures: no other orders today are guaranteed, so
  -- check the per-line maths through a period with only this order
  update public.orders set created_at = '2001-01-01 12:00+05:30' where id = oid;
  p := public.admin_profit('2001-01-01', '2001-01-01');
  if not ((p ->> 'gst_paid')::numeric = 15.00 and (p ->> 'itc')::numeric = 6.00
          and (p ->> 'kept')::numeric = -9.00 and (p ->> 'kept_no_itc')::numeric = -15.00
          and (p ->> 'gst_owed')::numeric = 12.00) then
    raise exception 'FAIL: profit_uses_paid_and_claimable %', p; end if;

  -- no_credit_claims_nothing: input tax credit off in Settings
  update public.store_settings set gst_input_credit = false where id = 1;
  p := public.admin_profit('2001-01-01', '2001-01-01');
  if not ((p ->> 'itc')::numeric = 0 and (p ->> 'kept')::numeric = -15.00 and (p ->> 'gst_owed')::numeric = 18.00) then
    raise exception 'FAIL: no_credit_claims_nothing %', p; end if;
end $$;
