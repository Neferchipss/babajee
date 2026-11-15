-- Run with: bash scripts/test-sql.sh supabase/migrations/0051_gst_compliance.sql supabase/tests/0051_gst_compliance.test.sql
-- Everything runs inside begin/rollback; nothing is left behind.
do $$
declare
  admin uuid;
  o uuid;
  o2 uuid;
  rf uuid;
  t numeric;
  tot numeric;
  sg numeric;
  cn record;
  n int;
  sup uuid;
  rc uuid;
  j jsonb;
begin
  select id into admin from public.profiles where role = 'admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);

  -- an order with items at 5% and 18%, shipping 100, GST-inclusive prices
  insert into public.orders (profile_id, status, contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total, gst_inclusive)
  values (admin, 'pending', 'T', 't@example.com', '9999999999', 'x', 'Pune', 'Maharashtra', '411001', 300, 100, 0, 400, true)
  returning id into o;
  insert into public.order_items (order_id, product_name, variant_label, unit_price, quantity, gst_rate)
  values (o, 'A', '', 100, 1, 5), (o, 'B', '', 200, 1, 18);
  perform public.order_retax(o);
  select tax, total into t, tot from public.orders where id = o;
  -- goods: 100 @5% incl = 4.76, 200 @18% incl = 30.51; shipping 100 @18% incl = 15.25
  if public.shipping_gst(o) <> 15.25 then raise exception 'FAIL shipping_gst_highest_rate: %', public.shipping_gst(o); end if;
  if t <> 50.52 then raise exception 'FAIL tax_includes_shipping: %', t; end if;
  if tot <> 400 then raise exception 'FAIL inclusive_total_unchanged: %', tot; end if;

  -- an old order (shipping_taxed false) keeps no shipping GST
  update public.orders set shipping_taxed = false where id = o;
  perform public.order_retax(o);
  select tax into t from public.orders where id = o;
  if t <> 35.27 then raise exception 'FAIL old_order_untaxed_shipping: %', t; end if;
  update public.orders set shipping_taxed = true where id = o;

  -- exclusive prices: GST added on top of shipping
  update public.orders set gst_inclusive = false where id = o;
  perform public.order_retax(o);
  select tax, total into t, tot from public.orders where id = o;
  -- goods 5 + 36 = 41; shipping 18 -> tax 59, total 300 + 100 + 59
  if t <> 59 or tot <> 459 then raise exception 'FAIL exclusive_shipping_on_top: % %', t, tot; end if;
  update public.orders set gst_inclusive = true where id = o;
  perform public.order_retax(o);

  -- buyer GSTIN: format checked, locked once invoiced
  begin
    perform public.admin_set_buyer_gstin(o, 'nonsense');
    raise exception 'FAIL buyer_gstin_format_not_checked';
  exception when sqlstate '22023' then null;
  end;
  perform public.admin_set_buyer_gstin(o, '27abcde1234f1z5');
  if (select buyer_gstin from public.orders where id = o) <> '27ABCDE1234F1Z5' then raise exception 'FAIL buyer_gstin_saved_upper'; end if;
  update public.orders set status = 'paid', paid_total = 400 where id = o;
  perform public.admin_issue_invoices(array[o]);
  begin
    perform public.admin_set_buyer_gstin(o, '');
    raise exception 'FAIL buyer_gstin_locked_after_invoice';
  exception when sqlstate '22023' then null;
  end;

  -- credit note for a refund on an invoiced order, with shipping GST in it
  insert into public.order_refunds (order_id, amount, subtotal, shipping, tax) values (o, 300, 200, 100, 30.51) returning id into rf;
  select * into cn from public.admin_issue_credit_notes(array[o]) limit 1;
  if cn.number !~ '-CN/[0-9]{2}-[0-9]{2}/0001$' then raise exception 'FAIL cn_number_series: %', cn.number; end if;
  if (select tax from public.credit_notes where id = cn.id) <> 45.76 then raise exception 'FAIL cn_tax_with_shipping: %', (select tax from public.credit_notes where id = cn.id); end if;
  -- issuing again makes no second note
  perform public.admin_issue_credit_notes(array[o]);
  select count(*) into n from public.credit_notes where order_id = o;
  if n <> 1 then raise exception 'FAIL cn_idempotent: %', n; end if;
  -- undoing the refund keeps the note, unlinked
  delete from public.order_refunds where id = rf;
  if (select refund_id from public.credit_notes where id = cn.id) is not null then raise exception 'FAIL cn_survives_undo'; end if;

  -- an order without an invoice gets no credit note
  insert into public.orders (profile_id, status, contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total)
  values (admin, 'pending', 'T', 't@example.com', '9999999999', 'x', 'Pune', 'Maharashtra', '411001', 100, 0, 0, 100) returning id into o2;
  insert into public.order_refunds (order_id, amount, subtotal) values (o2, 50, 50);
  perform public.admin_issue_credit_notes(array[o2]);
  if exists (select 1 from public.credit_notes where order_id = o2) then raise exception 'FAIL cn_needs_invoice'; end if;

  -- purchase bill ticks and ITC
  insert into public.suppliers (name, gstin) values ('TEST sup', '27ABCDE1234F1Z5') returning id into sup;
  insert into public.stock_receipts (kind, supplier_id, bill_no, bill_date) values ('bill', sup, 'T-1', current_date - 200) returning id into rc;
  insert into public.stock_receipt_lines (receipt_id, variant_id, qty, unit_price, gst_rate, gst, cgst, sgst, igst, claimable)
  values (rc, (select id from public.product_variants limit 1), 1, 100, 18, 18, 9, 9, 0, true);
  j := public.admin_itc(current_date - 400, current_date);
  if (j->0->>'on_bills')::numeric <> 18 or coalesce((j->0->>'in_2b')::numeric, 0) <> 0 then raise exception 'FAIL itc_needs_2b: %', j; end if;
  perform public.admin_set_receipt_flags(rc, true, null);
  j := public.admin_itc(current_date - 400, current_date);
  if (j->0->>'in_2b')::numeric <> 18 then raise exception 'FAIL itc_after_2b: %', j; end if;
  j := public.admin_unpaid_bills(180);
  if not exists (select 1 from jsonb_array_elements(j) e where (e->>'id')::uuid = rc) then raise exception 'FAIL unpaid_180_listed: %', j; end if;
  perform public.admin_set_receipt_flags(rc, true, current_date);
  j := public.admin_unpaid_bills(180);
  if exists (select 1 from jsonb_array_elements(j) e where (e->>'id')::uuid = rc) then raise exception 'FAIL paid_not_listed'; end if;

  if not ('credit_notes' = any(public.export_table_list())) then raise exception 'FAIL export_lists_credit_notes'; end if;

  -- non-admin blocked
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    perform public.admin_issue_credit_notes(array[o]);
    raise exception 'FAIL non_admin_blocked';
  exception when sqlstate '42501' then null;
  end;
end;
$$;
