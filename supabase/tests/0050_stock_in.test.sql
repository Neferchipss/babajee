-- Tests for migration 0050 (stock in, suppliers, supplier bills).
-- Run through scripts/test-sql.sh, which wraps migration + this file in a
-- transaction that is rolled back. An empty response means every check passed.

do $$
declare
  adm uuid;
  cat uuid;
  prod uuid;
  v1 uuid; v2 uuid; v3 uuid; v4 uuid; v5 uuid; v6 uuid; v7 uuid;
  s1 uuid; s2 uuid;
  r_open uuid; r_bill uuid; r_inter uuid; r_a uuid; r_b uuid; r_c uuid; r_d uuid;
  r_neg uuid; r_new uuid;
  l record;
  n int;
  m jsonb;
  got boolean;
  mon text := to_char(current_date, 'YYYY-MM');
  claim_expected numeric;
  gst_all numeric;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  if adm is null then raise exception 'FAIL: setup (no admin profile)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  if not public.is_admin() then raise exception 'FAIL: setup (is_admin false)'; end if;

  update public.store_settings set gstin = '27AAAAA0000A1Z5' where id = 1;

  insert into public.categories (slug, name) values ('zz-test-cat', 'Test') returning id into cat;
  insert into public.products (category_id, slug, name, gst_rate) values (cat, 'zz-test-prod', 'Test product', 18) returning id into prod;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (prod, 'V1', 500, 0, false) returning id into v1;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (prod, 'V2', 500, 0, false) returning id into v2;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (prod, 'V3', 500, 0, false) returning id into v3;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (prod, 'V4', 500, 0, false) returning id into v4;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (prod, 'V5', 500, 0, false) returning id into v5;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (prod, 'V6', 500, 0, false) returning id into v6;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (prod, 'V7', 500, 0, false) returning id into v7;

  s1 := public.admin_save_supplier(jsonb_build_object('name', 'Same State Traders', 'gstin', '27BBBBB1111B1Z5'));
  s2 := public.admin_save_supplier(jsonb_build_object('name', 'Other State Traders', 'gstin', '29CCCCC2222C1Z5'));

  -- opening_sets_stock_and_avg
  r_open := public.admin_post_receipt('opening', null, '', current_date, '',
    jsonb_build_array(jsonb_build_object('variant_id', v1, 'qty', 10, 'unit_price', 100, 'gst_rate', 18)));
  if not (select stock_qty = 10 and track_stock from public.product_variants where id = v1) then raise exception 'FAIL: opening_sets_stock_and_avg stock/track'; end if;
  if not ((select purchase from public.variant_costs where variant_id = v1) = 100) then raise exception 'FAIL: opening_sets_stock_and_avg purchase'; end if;
  if not ((select count(*) from public.stock_movements where variant_id = v1 and reason = 'stock_in' and receipt_id = r_open) = 1) then raise exception 'FAIL: opening_sets_stock_and_avg movement'; end if;
  if not (select not claimable from public.stock_receipt_lines where receipt_id = r_open and variant_id = v1) then raise exception 'FAIL: opening_sets_stock_and_avg claimable'; end if;

  -- bill_moves_average
  r_bill := public.admin_post_receipt('bill', s1, 'B-120', current_date, '',
    jsonb_build_array(jsonb_build_object('variant_id', v1, 'qty', 10, 'unit_price', 120, 'gst_rate', 18)));
  if not ((select stock_qty from public.product_variants where id = v1) = 20) then raise exception 'FAIL: bill_moves_average stock'; end if;
  if not ((select purchase from public.variant_costs where variant_id = v1) = 110.00) then raise exception 'FAIL: bill_moves_average purchase'; end if;
  select * into l from public.stock_receipt_lines where receipt_id = r_bill;
  if not (l.gst = 216.00 and l.cgst = 108.00 and l.sgst = 108.00 and l.igst = 0 and l.claimable) then raise exception 'FAIL: bill_moves_average gst split'; end if;

  -- interstate_is_igst
  r_inter := public.admin_post_receipt('bill', s2, 'I-1', current_date, '',
    jsonb_build_array(jsonb_build_object('variant_id', v2, 'qty', 1, 'unit_price', 100, 'gst_rate', 18)));
  select * into l from public.stock_receipt_lines where receipt_id = r_inter;
  if not (l.igst = 18.00 and l.cgst = 0 and l.sgst = 0) then raise exception 'FAIL: interstate_is_igst'; end if;

  -- same_bill_no_joins
  r_a := public.admin_post_receipt('bill', s1, 'A-1', current_date, '',
    jsonb_build_array(jsonb_build_object('variant_id', v3, 'qty', 1, 'unit_price', 10, 'gst_rate', 18)));
  r_b := public.admin_post_receipt('bill', s1, 'a-1', current_date, '',
    jsonb_build_array(jsonb_build_object('variant_id', v3, 'qty', 2, 'unit_price', 10, 'gst_rate', 18)));
  if not (r_a = r_b and (select count(*) from public.stock_receipt_lines where receipt_id = r_a) = 2) then raise exception 'FAIL: same_bill_no_joins same supplier'; end if;
  r_c := public.admin_post_receipt('bill', s2, 'A-1', current_date, '',
    jsonb_build_array(jsonb_build_object('variant_id', v3, 'qty', 1, 'unit_price', 10, 'gst_rate', 18)));
  if not (r_c <> r_a) then raise exception 'FAIL: same_bill_no_joins different supplier'; end if;

  -- negative_stock_average
  perform public.admin_correct_stock(v4, 0, 'start');
  update public.product_variants set stock_qty = -3 where id = v4;
  r_neg := public.admin_post_receipt('bill', s1, 'N-1', current_date, '',
    jsonb_build_array(jsonb_build_object('variant_id', v4, 'qty', 5, 'unit_price', 50, 'gst_rate', 18)));
  if not ((select purchase from public.variant_costs where variant_id = v4) = 50.00) then raise exception 'FAIL: negative_stock_average purchase'; end if;
  if not ((select stock_qty from public.product_variants where id = v4) = 2) then raise exception 'FAIL: negative_stock_average stock'; end if;

  -- purchase_gst_by_month (before the void, while the 120 bill still counts)
  m := public.admin_purchase_gst(current_date - 40, current_date + 40);
  select coalesce(sum(sl.gst), 0) into gst_all from public.stock_receipt_lines sl join public.stock_receipts r on r.id = sl.receipt_id where r.status = 'posted' and to_char(r.bill_date, 'YYYY-MM') = mon;
  select coalesce(sum(sl.gst), 0) into claim_expected from public.stock_receipt_lines sl join public.stock_receipts r on r.id = sl.receipt_id where r.status = 'posted' and sl.claimable and to_char(r.bill_date, 'YYYY-MM') = mon;
  if not ((select (e ->> 'claimable_gst')::numeric from jsonb_array_elements(m) e where e ->> 'month' = mon) = claim_expected) then raise exception 'FAIL: purchase_gst_by_month claimable'; end if;
  if not ((select (e ->> 'gst')::numeric from jsonb_array_elements(m) e where e ->> 'month' = mon) = gst_all and gst_all > claim_expected) then raise exception 'FAIL: purchase_gst_by_month excludes opening'; end if;

  -- void_recomputes
  perform public.admin_void_receipt(r_bill);
  if not ((select stock_qty from public.product_variants where id = v1) = 10) then raise exception 'FAIL: void_recomputes stock'; end if;
  if not ((select purchase from public.variant_costs where variant_id = v1) = 100.00) then raise exception 'FAIL: void_recomputes purchase'; end if;
  if not ((select count(*) from public.stock_movements where variant_id = v1 and reason = 'void' and receipt_id = r_bill) = 1) then raise exception 'FAIL: void_recomputes movement'; end if;
  r_new := public.admin_post_receipt('bill', s1, 'B-120', current_date, '',
    jsonb_build_array(jsonb_build_object('variant_id', v1, 'qty', 1, 'unit_price', 100, 'gst_rate', 18)));
  if not (r_new <> r_bill) then raise exception 'FAIL: void_recomputes bill_no reusable'; end if;

  -- void_after_sale_goes_negative
  r_d := public.admin_post_receipt('bill', s1, 'D-1', current_date, '',
    jsonb_build_array(jsonb_build_object('variant_id', v5, 'qty', 5, 'unit_price', 10, 'gst_rate', 18)));
  update public.product_variants set stock_qty = 2 where id = v5;
  perform public.admin_void_receipt(r_d);
  if not ((select stock_qty from public.product_variants where id = v5) = -3) then raise exception 'FAIL: void_after_sale_goes_negative'; end if;

  -- correction_needs_note
  got := false;
  begin perform public.admin_correct_stock(v6, 4, ''); exception when others then got := true; end;
  if not got then raise exception 'FAIL: correction_needs_note (blank accepted)'; end if;
  perform public.admin_correct_stock(v6, 4, 'shelf count');
  if not ((select stock_qty from public.product_variants where id = v6) = 4) then raise exception 'FAIL: correction_needs_note stock'; end if;
  if not ((select count(*) from public.stock_movements where variant_id = v6 and reason = 'correction' and note = 'shelf count') = 1) then raise exception 'FAIL: correction_needs_note movement'; end if;

  -- bill_needs_supplier_and_no
  got := false;
  begin perform public.admin_post_receipt('bill', null, 'X-1', current_date, '', jsonb_build_array(jsonb_build_object('variant_id', v6, 'qty', 1, 'unit_price', 1, 'gst_rate', 0))); exception when others then got := true; end;
  if not got then raise exception 'FAIL: bill_needs_supplier_and_no (no supplier)'; end if;
  got := false;
  begin perform public.admin_post_receipt('bill', s1, '  ', current_date, '', jsonb_build_array(jsonb_build_object('variant_id', v6, 'qty', 1, 'unit_price', 1, 'gst_rate', 0))); exception when others then got := true; end;
  if not got then raise exception 'FAIL: bill_needs_supplier_and_no (no bill no)'; end if;

  -- track_all_idempotent (v7 was never counted)
  n := public.admin_track_all_stock();
  if not (n >= 1) then raise exception 'FAIL: track_all_idempotent first'; end if;
  if not (public.admin_track_all_stock() = 0 and public.admin_uncounted() = 0) then raise exception 'FAIL: track_all_idempotent second'; end if;

  -- listing and detail shapes
  if not (jsonb_array_length(public.admin_receipts(current_date - 1, current_date + 1)) >= 5) then raise exception 'FAIL: admin_receipts'; end if;
  if not (jsonb_array_length(public.admin_receipt(r_a) -> 'lines') = 2) then raise exception 'FAIL: admin_receipt'; end if;
  if not ((select count(*) from public.admin_suppliers() where id in (s1, s2)) = 2) then raise exception 'FAIL: admin_suppliers'; end if;

  -- export_lists_new_tables
  if not ('suppliers' = any (public.export_table_list()) and 'stock_receipts' = any (public.export_table_list()) and 'stock_receipt_lines' = any (public.export_table_list())) then raise exception 'FAIL: export_lists_new_tables'; end if;

  -- non_admin_blocked
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  got := false;
  begin
    perform public.admin_post_receipt('quick', null, '', current_date, '', jsonb_build_array(jsonb_build_object('variant_id', v6, 'qty', 1, 'unit_price', 1, 'gst_rate', 0)));
  exception when sqlstate '42501' then got := true; end;
  if not got then raise exception 'FAIL: non_admin_blocked'; end if;
end $$;
