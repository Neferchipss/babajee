-- 0057: cost from the GST actually on the bills; price corrections with a
-- reason that later bills average against; each sale freezes its GST share;
-- the money functions still run.
-- Run with: bash scripts/test-sql.sh supabase/migrations/0057_accounts_accuracy.sql supabase/tests/0057_accounts_accuracy.test.sql
do $$
declare
  admin_id uuid; v uuid; prod uuid; sid uuid; vc record; oid uuid; iid uuid; g numeric; n int;
begin
  update public.email_config set enabled = false where id = 1;
  select id into admin_id from public.profiles where role = 'admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin_id::text, true);

  -- an option sold at 40%, bought at 18%
  select pv.id, pv.product_id into v, prod from public.product_variants pv order by pv.id limit 1;
  update public.products set gst_rate = 40 where id = prod;
  update public.product_variants set track_stock = true, stock_qty = 0 where id = v;
  delete from public.purchase_corrections where variant_id = v;
  delete from public.variant_costs where variant_id = v;
  sid := public.admin_save_supplier(jsonb_build_object('name', 'Test 0057 Supplier', 'gstin', '', 'phone', '', 'notes', ''));

  perform public.admin_post_receipt('bill', sid, 'T57-1', (now() at time zone 'Asia/Kolkata')::date, '',
    jsonb_build_array(jsonb_build_object('variant_id', v, 'qty', 10, 'unit_price', 100, 'gst_rate', 18)));
  select * into vc from public.variant_costs where variant_id = v;
  if vc.purchase <> 100 or vc.gst_paid <> 18 or vc.cost <> 118 then
    raise exception 'FAIL: bill cost % + % = % (want 100 + 18 = 118)', vc.purchase, vc.gst_paid, vc.cost;
  end if;

  -- a correction needs a reason
  begin
    perform public.admin_set_purchase(v, 90, 18, '  ');
    raise exception 'FAIL: no reason accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  perform public.admin_set_purchase(v, 90, 18, 'Typed the wrong price');
  select * into vc from public.variant_costs where variant_id = v;
  if vc.purchase <> 90 or vc.gst_paid <> 16.2 or vc.cost <> 106.2 then
    raise exception 'FAIL: corrected % + % = %', vc.purchase, vc.gst_paid, vc.cost;
  end if;
  if not exists (select 1 from public.purchase_corrections where variant_id = v and reason = 'Typed the wrong price' and actor_id = admin_id) then
    raise exception 'FAIL: correction not kept';
  end if;

  -- a later bill averages against the correction (10 at 90, 10 at 110 -> 100; GST 16.2 and 19.8 -> 18)
  update public.stock_movements set created_at = now() - interval '2 minutes' where variant_id = v;
  update public.purchase_corrections set created_at = now() - interval '1 minute' where variant_id = v;
  perform public.admin_post_receipt('bill', sid, 'T57-2', (now() at time zone 'Asia/Kolkata')::date, '',
    jsonb_build_array(jsonb_build_object('variant_id', v, 'qty', 10, 'unit_price', 110, 'gst_rate', 18)));
  select * into vc from public.variant_costs where variant_id = v;
  if vc.purchase <> 100 or vc.gst_paid <> 18 or vc.cost <> 118 then
    raise exception 'FAIL: after the next bill % + % = % (want 100 + 18 = 118)', vc.purchase, vc.gst_paid, vc.cost;
  end if;

  -- a sale freezes its GST share
  insert into public.orders (contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total, is_test)
  values ('T', 't@example.com', '9000000001', 'x', 'Pune', 'Maharashtra', '411001', 200, 0, 0, 200, true) returning id into oid;
  insert into public.order_items (order_id, variant_id, product_name, unit_price, quantity) values (oid, v, 'Thing', 200, 1) returning id into iid;
  insert into public.order_item_costs (order_item_id, unit_cost) values (iid, 118) on conflict (order_item_id) do update set unit_cost = 118, unit_gst = null;
  select unit_gst into g from public.order_item_costs where order_item_id = iid;
  if g is distinct from 18.00 then raise exception 'FAIL: frozen GST %', g; end if;

  -- everyone has a starting point, and the money functions run
  select count(*) into n from public.variant_costs vc2 where vc2.purchase is not null and not exists (select 1 from public.purchase_corrections pc where pc.variant_id = vc2.variant_id);
  if n > 0 then raise exception 'FAIL: % options without a starting point', n; end if;
  perform public.admin_profit(((now() at time zone 'Asia/Kolkata')::date - 400), (now() at time zone 'Asia/Kolkata')::date);
  perform public.admin_report('finance', ((now() at time zone 'Asia/Kolkata')::date - 400), (now() at time zone 'Asia/Kolkata')::date);
  perform public.admin_report('products', ((now() at time zone 'Asia/Kolkata')::date - 400), (now() at time zone 'Asia/Kolkata')::date);
  perform public.admin_report('gst', ((now() at time zone 'Asia/Kolkata')::date - 400), (now() at time zone 'Asia/Kolkata')::date);
  perform public.admin_analytics(((now() at time zone 'Asia/Kolkata')::date - 400), (now() at time zone 'Asia/Kolkata')::date);
  perform public.admin_sales_by_category(((now() at time zone 'Asia/Kolkata')::date - 400), (now() at time zone 'Asia/Kolkata')::date);
  perform public.admin_geo(((now() at time zone 'Asia/Kolkata')::date - 400), (now() at time zone 'Asia/Kolkata')::date);
  perform public.admin_sales_by_age(((now() at time zone 'Asia/Kolkata')::date - 400), (now() at time zone 'Asia/Kolkata')::date);
  -- test orders and unpaid orders are not sales
  if (public.admin_analytics('2000-01-01', (now() at time zone 'Asia/Kolkata')::date) ->> 'orders')::int
     <> (select count(*) from public.orders where status not in ('cancelled', 'pending') and not is_test) then
    raise exception 'FAIL: analytics counts unpaid or test orders';
  end if;
end $$;
