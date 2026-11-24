-- Tests for 0085 (the counter till). Rolled back. Empty response: passed.
-- Run with: bash scripts/test-sql.sh supabase/migrations/0085_counter_sales.sql supabase/tests/0085_counter_sales.test.sql
do $$
declare
  adm uuid; cat uuid; p uuid; a uuid; b uuid; sess uuid;
  r record; r2 record; o record; n int; t jsonb; cash_sales numeric;
begin
  update public.email_config set enabled = false where id = 1;
  select id into adm from public.profiles where role = 'admin' and staff_role in ('owner', 'admin') limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  update public.store_settings
     set gst_rate = 18, gst_inclusive = true, payment_methods = array['UPI', 'Bank transfer', 'Cash'],
         counter_methods = '{}', counter_cash_method = 'Cash', counter_drawer = true,
         counter_discounts = true, counter_max_discount = 100, counter_price_change = true, counter_negative_stock = false,
         store_state = 'Maharashtra'
   where id = 1;
  -- no drawer can be open from before
  update public.counter_sessions set closed_at = now() where closed_at is null;

  insert into public.categories (slug, name) values ('zz-0085', 'T') returning id into cat;
  insert into public.products (category_id, slug, name, status, gst_rate) values (cat, 'zz-0085', 'Till test', 'published', 18) returning id into p;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (p, 'Counted', 118, 5, true) returning id into a;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (p, 'Loose', 100, 0, false) returning id into b;

  -- with the drawer switched on, nothing sells until it's open
  begin
    perform * from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', a, 'qty', 1)), '[{"method":"Cash","amount":118}]'::jsonb);
    raise exception 'FAIL: sold_with_drawer_shut';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  sess := public.counter_open(500);
  begin
    perform public.counter_open(100);
    raise exception 'FAIL: two_drawers_open';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;

  -- a cash sale with change
  select * into r from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', a, 'qty', 2)), '[{"method":"Cash","amount":300}]'::jsonb, null, '{}'::jsonb, '', '', 'k-0085-1');
  select * into o from public.orders where id = r.order_id;
  if o.channel <> 'counter' or o.status <> 'delivered' or o.paid_total <> 236 or o.total <> 236 then
    raise exception 'FAIL: cash_sale % % % %', o.channel, o.status, o.paid_total, o.total; end if;
  if r.change <> 64 or o.counter_change <> 64 or o.counter_tendered <> 300 then raise exception 'FAIL: change % %', r.change, o.counter_change; end if;
  if o.contact_name <> 'Walk-in customer' or o.contact_email <> '' or o.address_state <> 'Maharashtra' or o.shipping <> 0 then raise exception 'FAIL: walk_in_fields'; end if;
  if o.counter_session <> sess then raise exception 'FAIL: session'; end if;
  if (select stock_qty from public.product_variants where id = a) <> 3 then raise exception 'FAIL: stock_taken'; end if;
  select count(*) into n from public.payments where order_id = r.order_id and status = 'captured' and method = 'Cash' and amount = 236;
  if n <> 1 then raise exception 'FAIL: one_cash_payment (%)', n; end if;
  if (select count(*) from public.payments where order_id = r.order_id) <> 1 then raise exception 'FAIL: only_one_payment_row'; end if;
  if o.tax <> 36 then raise exception 'FAIL: gst %', o.tax; end if;

  -- sent twice: the same sale, stock taken once
  select * into r2 from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', a, 'qty', 2)), '[{"method":"Cash","amount":300}]'::jsonb, null, '{}'::jsonb, '', '', 'k-0085-1');
  if r2.order_id <> r.order_id or (select stock_qty from public.product_variants where id = a) <> 3 then raise exception 'FAIL: idempotent'; end if;

  -- split between UPI and cash
  select * into r2 from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', b, 'qty', 1)), '[{"method":"UPI","amount":60,"reference":"4123"},{"method":"Cash","amount":40}]'::jsonb,
                                            null, '{"name":"Ravi","phone":"9000000000"}'::jsonb);
  select count(*) into n from public.payments where order_id = r2.order_id and status = 'captured';
  if n <> 2 then raise exception 'FAIL: split_rows %', n; end if;
  if not exists (select 1 from public.payments where order_id = r2.order_id and method = 'UPI' and amount = 60 and reference = '4123') then raise exception 'FAIL: split_upi'; end if;
  if (select contact_name from public.orders where id = r2.order_id) <> 'Ravi' then raise exception 'FAIL: named_customer'; end if;

  -- short, over-paid by card, unknown way to pay: refused
  begin
    perform * from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', b, 'qty', 1)), '[{"method":"Cash","amount":50}]'::jsonb);
    raise exception 'FAIL: short_accepted';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    perform * from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', b, 'qty', 1)), '[{"method":"UPI","amount":150}]'::jsonb);
    raise exception 'FAIL: upi_change_accepted';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    perform * from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', b, 'qty', 1)), '[{"method":"Bitcoin","amount":100}]'::jsonb);
    raise exception 'FAIL: unknown_method_accepted';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;

  -- stock: refused past what's there, unless selling with no stock is on
  begin
    perform * from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', a, 'qty', 10)), '[{"method":"Cash","amount":1180}]'::jsonb);
    raise exception 'FAIL: oversold';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  update public.store_settings set counter_negative_stock = true where id = 1;
  perform * from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', a, 'qty', 4)), '[{"method":"Cash","amount":472}]'::jsonb);
  if (select stock_qty from public.product_variants where id = a) <> -1 then raise exception 'FAIL: negative_stock_allowed'; end if;

  -- prices: no changes, discounts up to 10%
  update public.store_settings set counter_price_change = false, counter_max_discount = 10 where id = 1;
  begin
    perform * from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', b, 'qty', 1, 'price', 80)), '[{"method":"Cash","amount":80}]'::jsonb);
    raise exception 'FAIL: big_discount';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    perform * from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', b, 'qty', 1, 'price', 130)), '[{"method":"Cash","amount":130}]'::jsonb);
    raise exception 'FAIL: price_raised';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform * from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', b, 'qty', 1, 'price', 95)), '[{"method":"Cash","amount":95}]'::jsonb);
  update public.store_settings set counter_discounts = false where id = 1;
  begin
    perform * from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', b, 'qty', 1, 'price', 95)), '[{"method":"Cash","amount":95}]'::jsonb);
    raise exception 'FAIL: discount_when_off';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  update public.store_settings set counter_discounts = true, counter_price_change = true where id = 1;

  -- a business buyer's GSTIN goes on the sale
  select * into r2 from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', b, 'qty', 1)), '[{"method":"Cash","amount":100}]'::jsonb, null, '{}'::jsonb, '27abcde1234f1z5');
  if (select buyer_gstin from public.orders where id = r2.order_id) <> '27ABCDE1234F1Z5' then raise exception 'FAIL: gstin'; end if;

  -- the invoice is issued as for any paid order
  set constraints all immediate;
  if (select invoice_number from public.orders where id = r.order_id) is null then raise exception 'FAIL: invoice_issued'; end if;

  -- the drawer: cash in and out, totals, close
  perform public.counter_cash('in', 50, 'Change from the bank');
  perform public.counter_cash('out', 20, 'Tea');
  begin
    perform public.counter_cash('out', 5, '  ');
    raise exception 'FAIL: no_reason_accepted';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  t := public.counter_totals(sess);
  select coalesce(sum(pm.amount), 0) into cash_sales from public.payments pm join public.orders x on x.id = pm.order_id
   where x.counter_session = sess and pm.status = 'captured' and pm.method = 'Cash';
  if (t ->> 'cash_sales')::numeric <> cash_sales then raise exception 'FAIL: cash_sales % %', t ->> 'cash_sales', cash_sales; end if;
  if (t ->> 'expected_cash')::numeric <> 500 + 50 - 20 + cash_sales then raise exception 'FAIL: expected %', t ->> 'expected_cash'; end if;
  if (t -> 'by_method' ->> 'UPI')::numeric <> 60 then raise exception 'FAIL: by_method'; end if;
  t := public.counter_close(1000, 'Counted twice');
  if (t ->> 'closed_at') is null or (t ->> 'counted_cash')::numeric <> 1000 then raise exception 'FAIL: closed'; end if;
  begin
    perform * from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', b, 'qty', 1)), '[{"method":"Cash","amount":100}]'::jsonb);
    raise exception 'FAIL: sold_after_close';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;

  -- with the drawer switched off, sales need no session
  update public.store_settings set counter_drawer = false where id = 1;
  select * into r2 from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', b, 'qty', 1)), '[{"method":"UPI","amount":100}]'::jsonb);
  if (select counter_session from public.orders where id = r2.order_id) is not null then raise exception 'FAIL: no_session_when_off'; end if;

  -- online orders are untouched: same function, same result, marked online
  select * into r2 from public.admin_create_order(null, '{"name":"Online","phone":"9000000001","email":"o@example.com"}'::jsonb,
    '{"line1":"1 Road","city":"Pune","state":"Maharashtra","pincode":"411001"}'::jsonb, jsonb_build_array(jsonb_build_object('variant', b, 'qty', 1)), null, '', false);
  select * into o from public.orders where id = r2.order_id;
  if o.channel <> 'online' or o.status <> 'pending' or o.paid_total is not null or o.counter_session is not null or o.address_city <> 'Pune' then
    raise exception 'FAIL: online_unchanged % %', o.channel, o.status; end if;
  -- an order inserted the way checkout does is online too
  insert into public.orders (contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total, is_test)
  values ('C', 'c@example.com', '9000000002', 'x', 'Pune', 'Maharashtra', '411001', 100, 0, 0, 100, true) returning * into o;
  if o.channel <> 'online' then raise exception 'FAIL: default_online'; end if;
  begin
    update public.orders set channel = 'shop' where id = o.id;
    raise exception 'FAIL: channel_checked';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select 'ok' where false;
