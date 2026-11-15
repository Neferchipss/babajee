-- Run with: bash scripts/test-sql.sh supabase/migrations/0051_gst_compliance.sql supabase/tests/0051_gst_compliance.test.sql
-- Everything runs inside begin/rollback; nothing is left behind.
do $$
declare
  admin uuid;
  v uuid;
  o uuid;
  o2 uuid;
  it uuid;
  it2 uuid;
  rf uuid;
  cn record;
  inv text;
  n int;
  sup uuid;
  rc uuid;
  j jsonb;
begin
  select id into admin from public.profiles where role = 'admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  select pv.id into v from public.product_variants pv limit 1;
  update public.products set hsn = '4813' where id = (select product_id from public.product_variants where id = v);

  -- a pending order: HSN copied onto its line
  insert into public.orders (profile_id, status, contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total, gst_inclusive)
  values (admin, 'pending', 'T', 't@example.com', '9999999999', 'x', 'Pune', 'Maharashtra', '411001', 300, 50, 0, 350, true)
  returning id into o;
  insert into public.order_items (order_id, variant_id, product_name, variant_label, unit_price, quantity, gst_rate)
  values (o, v, 'A', '', 100, 1, 5) returning id into it;
  insert into public.order_items (order_id, product_name, variant_label, unit_price, quantity, gst_rate)
  values (o, 'B', '', 200, 1, 18) returning id into it2;
  if (select hsn from public.order_items where id = it) <> '4813' then raise exception 'FAIL hsn_snapshot'; end if;
  perform public.order_retax(o);
  -- shipping stays untaxed: goods 4.76 + 30.51
  if (select tax from public.orders where id = o) <> 35.27 then raise exception 'FAIL shipping_untaxed: %', (select tax from public.orders where id = o); end if;

  -- buyer GSTIN: format checked, saved upper-case
  begin
    perform public.admin_set_buyer_gstin(o, 'nonsense');
    raise exception 'FAIL buyer_gstin_format_not_checked';
  exception when sqlstate '22023' then null;
  end;
  perform public.admin_set_buyer_gstin(o, '27abcde1234f1z5');
  if (select buyer_gstin from public.orders where id = o) <> '27ABCDE1234F1Z5' then raise exception 'FAIL buyer_gstin_saved_upper'; end if;

  -- paid: invoice issued at the end of the transaction (deferred)
  update public.orders set status = 'paid', paid_total = 350 where id = o;
  if (select invoice_number from public.orders where id = o) is not null then raise exception 'FAIL invoice_waits_for_commit'; end if;
  set constraints all immediate;
  select invoice_number into inv from public.orders where id = o;
  if inv is null or inv !~ '/[0-9]{2}-[0-9]{2}/[0-9]{4,}$' then raise exception 'FAIL invoice_on_payment: %', inv; end if;
  set constraints all deferred;

  -- invoiced: GSTIN, items and address locked
  begin
    perform public.admin_set_buyer_gstin(o, '');
    raise exception 'FAIL buyer_gstin_locked_after_invoice';
  exception when sqlstate '22023' then null;
  end;
  begin
    update public.order_items set quantity = 2 where id = it;
    raise exception 'FAIL items_locked';
  exception when sqlstate '22023' then null;
  end;
  begin
    update public.orders set address_city = 'Mumbai' where id = o;
    raise exception 'FAIL address_locked';
  exception when sqlstate '22023' then null;
  end;
  -- notes and status still change
  update public.orders set notes = 'ok', status = 'packed' where id = o;
  begin
    update public.orders set status = 'cancelled' where id = o;
    raise exception 'FAIL cancel_refused_once_invoiced';
  exception when sqlstate '22023' then null;
  end;
  begin
    update public.orders set paid_total = null where id = o;
    raise exception 'FAIL unpay_refused_once_invoiced';
  exception when sqlstate '22023' then null;
  end;

  -- a refund through admin_refund gets a credit note with the refund's GST
  perform public.admin_refund(o, jsonb_build_array(jsonb_build_object('item', it2, 'qty', 1)), 0, 200, false, false, 'damaged');
  set constraints all immediate;
  set constraints all deferred;
  select f.id into rf from public.order_refunds f where f.order_id = o;
  select * into cn from public.credit_notes where refund_id = rf;
  if cn.number !~ '^CN/[0-9]{2}-[0-9]{2}/0001$' then raise exception 'FAIL cn_number: %', cn.number; end if;
  if cn.amount <> 200 or cn.tax <> (select tax from public.order_refunds where id = rf) then raise exception 'FAIL cn_snapshot: % %', cn.amount, cn.tax; end if;
  if cn.tax <> 30.51 then raise exception 'FAIL cn_tax_item_only: %', cn.tax; end if;
  if length(cn.number) > 16 or length(inv) > 16 then raise exception 'FAIL doc_number_length'; end if;
  -- less than an item's value: its GST scaled down (100 @5% refunded 50)
  perform public.admin_refund(o, jsonb_build_array(jsonb_build_object('item', it, 'qty', 1)), 0, 50, false, false, 'partial');
  set constraints all immediate;
  set constraints all deferred;
  if (select f.tax from public.order_refunds f where f.order_id = o and f.amount = 50) <> 2.38 then raise exception 'FAIL partial_refund_tax: %', (select f.tax from public.order_refunds f where f.order_id = o and f.amount = 50); end if;
  -- the print page call makes no second note
  perform public.admin_issue_credit_notes(array[o]);
  select count(*) into n from public.credit_notes where order_id = o;
  if n <> 2 then raise exception 'FAIL cn_idempotent: %', n; end if;
  -- a refund with a credit note can't be undone
  begin
    perform public.admin_undo_refund(rf);
    raise exception 'FAIL undo_blocked';
  exception when sqlstate '22023' then null;
  end;

  -- refunded before its invoice: the note comes with the invoice
  insert into public.orders (profile_id, status, contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total)
  values (admin, 'pending', 'T', 't@example.com', '9999999999', 'x', 'Pune', 'Maharashtra', '411001', 100, 0, 0, 100) returning id into o2;
  insert into public.order_items (order_id, product_name, variant_label, unit_price, quantity, gst_rate) values (o2, 'C', '', 100, 1, 18) returning id into it;
  perform public.order_retax(o2);
  update public.orders set status = 'paid', paid_total = 100 where id = o2;
  perform public.admin_refund(o2, '[]'::jsonb, 0, 20, false, false, 'goodwill');
  if exists (select 1 from public.credit_notes where order_id = o2) then raise exception 'FAIL cn_needs_invoice'; end if;
  set constraints all immediate;
  if not exists (select 1 from public.credit_notes where order_id = o2) then raise exception 'FAIL cn_with_late_invoice'; end if;
  -- goodwill on an 18% order: GST inside the credit
  if (select tax from public.credit_notes where order_id = o2) <> 3.05 then raise exception 'FAIL goodwill_tax: %', (select tax from public.credit_notes where order_id = o2); end if;
  set constraints all deferred;

  -- purchase bill ticks and ITC by GSTR-2B month
  insert into public.suppliers (name, gstin) values ('TEST sup', '27ABCDE1234F1Z5') returning id into sup;
  insert into public.stock_receipts (kind, supplier_id, bill_no, bill_date) values ('bill', sup, 'T-1', current_date - 200) returning id into rc;
  insert into public.stock_receipt_lines (receipt_id, variant_id, qty, unit_price, gst_rate, gst, cgst, sgst, igst, claimable)
  values (rc, v, 1, 100, 18, 18, 9, 9, 0, true), (rc, v, 1, 100, 18, 18, 9, 9, 0, false);
  j := public.admin_itc(current_date - 400, current_date);
  if (select sum((e->>'on_bills')::numeric) from jsonb_array_elements(j) e) <> 18 then raise exception 'FAIL itc_claimable_lines_only: %', j; end if;
  if (select sum((e->>'in_2b')::numeric) from jsonb_array_elements(j) e) <> 0 then raise exception 'FAIL itc_needs_2b: %', j; end if;
  begin
    perform public.admin_set_receipt_flags(rc, true, null, current_date - 300);
    raise exception 'FAIL paid_before_bill_rejected';
  exception when sqlstate '22023' then null;
  end;
  perform public.admin_set_receipt_flags(rc, true, (current_date - 10), null);
  j := public.admin_itc(current_date - 30, current_date);
  if (select sum((e->>'in_2b')::numeric) from jsonb_array_elements(j) e) <> 18 then raise exception 'FAIL itc_in_2b_month: %', j; end if;
  j := public.admin_unpaid_bills(180);
  if not exists (select 1 from jsonb_array_elements(j) e where (e->>'id')::uuid = rc) then raise exception 'FAIL unpaid_180_listed: %', j; end if;
  perform public.admin_set_receipt_flags(rc, true, (current_date - 10), current_date);
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
