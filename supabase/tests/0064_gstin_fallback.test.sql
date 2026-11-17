-- Tests for migration 0064 (state code without a GSTIN). Run through
-- scripts/test-sql.sh: one transaction, rolled back. Empty response: passed.

do $$
declare
  adm uuid;
  cat uuid; prod uuid; v uuid;
  s_mh uuid; s_ka uuid;
  r uuid;
  l record;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);

  if public.gst_state_code('Maharashtra') <> '27' or public.gst_state_code(' tamil  nadu ') <> '33'
     or public.gst_state_code('Jammu & Kashmir') <> '01' or public.gst_state_code('Nowhere') is not null then
    raise exception 'FAIL: state_codes'; end if;

  -- no GSTIN in Settings, state Maharashtra
  update public.store_settings set gstin = '', store_state = 'Maharashtra' where id = 1;
  insert into public.categories (slug, name) values ('zz-test-0064', 'Test 0064') returning id into cat;
  insert into public.products (category_id, slug, name, gst_rate) values (cat, 'zz-test-0064-p', 'Test 0064', 18) returning id into prod;
  insert into public.product_variants (product_id, label, price) values (prod, 'One', 10) returning id into v;
  s_mh := public.admin_save_supplier(jsonb_build_object('name', 'Zz MH', 'gstin', '27BBBBB1111B1Z5'));
  s_ka := public.admin_save_supplier(jsonb_build_object('name', 'Zz KA', 'gstin', '29CCCCC2222C1Z5'));

  -- same_state_without_gstin: CGST + SGST
  r := public.admin_post_receipt('bill', s_mh, 'ZZ64-1', current_date, '', jsonb_build_array(jsonb_build_object('variant_id', v, 'qty', 1, 'unit_price', 100, 'gst_rate', 18)));
  select * into l from public.stock_receipt_lines where receipt_id = r;
  if not (l.cgst = 9 and l.sgst = 9 and l.igst = 0 and l.claimable) then raise exception 'FAIL: same_state_without_gstin (% % %)', l.cgst, l.sgst, l.igst; end if;

  -- other_state_without_gstin: IGST
  r := public.admin_post_receipt('bill', s_ka, 'ZZ64-2', current_date, '', jsonb_build_array(jsonb_build_object('variant_id', v, 'qty', 1, 'unit_price', 100, 'gst_rate', 18)));
  select * into l from public.stock_receipt_lines where receipt_id = r;
  if not (l.cgst = 0 and l.sgst = 0 and l.igst = 18) then raise exception 'FAIL: other_state_without_gstin'; end if;

  -- gstin_wins: a Karnataka GSTIN in Settings makes the Karnataka supplier local
  update public.store_settings set gstin = '29AAAAA0000A1Z5' where id = 1;
  r := public.admin_post_receipt('bill', s_ka, 'ZZ64-3', current_date, '', jsonb_build_array(jsonb_build_object('variant_id', v, 'qty', 1, 'unit_price', 100, 'gst_rate', 18)));
  select * into l from public.stock_receipt_lines where receipt_id = r;
  if not (l.cgst = 9 and l.sgst = 9 and l.igst = 0) then raise exception 'FAIL: gstin_wins'; end if;
end $$;
