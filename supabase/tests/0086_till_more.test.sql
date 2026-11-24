-- Tests for 0086 (the till, part two). Rolled back. Empty response: passed.
-- Run with: bash scripts/test-sql.sh supabase/migrations/0086_till_more.sql supabase/tests/0086_till_more.test.sql
do $$
declare
  adm uuid; cust uuid; cat uuid; p uuid; a uuid; b uuid; sess uuid;
  r record; o record; n int; t jsonb; b0 numeric; owed numeric; pay uuid; rf uuid; it uuid; st int;
begin
  update public.email_config set enabled = false where id = 1;
  select id into adm from public.profiles where role = 'admin' and staff_role in ('owner', 'admin') limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  update public.store_settings
     set gst_rate = 18, gst_inclusive = true, payment_methods = array['UPI', 'Bank transfer', 'Cash'],
         counter_methods = '{}', counter_cash_method = 'Cash', counter_drawer = true, counter_discounts = true,
         counter_max_discount = 100, counter_price_change = true, counter_negative_stock = false, store_state = 'Maharashtra',
         counter_credit = true, counter_credit_limit = 500
   where id = 1;
  update public.counter_sessions set closed_at = now() where closed_at is null;
  sess := public.counter_open(100);
  select id into cust from public.profiles where role = 'customer' limit 1;
  update public.profiles set credit_limit = null where id = cust;
  b0 := public.customer_balance(cust);
  -- room under the limit for the test, whatever they owe already
  update public.store_settings set counter_credit_limit = b0 + 500 where id = 1;

  insert into public.categories (slug, name) values ('zz-0086', 'T') returning id into cat;
  insert into public.products (category_id, slug, name, status, gst_rate) values (cat, 'zz-0086', 'Till two', 'published', 18) returning id into p;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (p, 'Loose', 100, 0, false) returning id into a;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (p, 'Counted', 118, 10, true) returning id into b;

  -- a discount is kept per line; the cashier is recorded
  select * into r from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', a, 'qty', 2, 'price', 90)), '[{"method":"Cash","amount":180}]'::jsonb);
  select * into o from public.orders where id = r.order_id;
  if o.counter_cashier <> adm or o.counter_on_account then raise exception 'FAIL: cashier'; end if;
  if (select list_price from public.order_items where order_id = r.order_id) <> 100 then raise exception 'FAIL: list_price'; end if;

  -- on account: needs the setting, a customer, and room under the limit
  begin
    perform * from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', a, 'qty', 1)), '[{"method":"On account","amount":100}]'::jsonb);
    raise exception 'FAIL: on_account_no_customer';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  select * into r from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', a, 'qty', 3)), '[{"method":"On account","amount":300}]'::jsonb, cust);
  select * into o from public.orders where id = r.order_id;
  if not o.counter_on_account or o.status <> 'delivered' or o.paid_total <> 300 then raise exception 'FAIL: on_account_sale % % %', o.counter_on_account, o.status, o.paid_total; end if;
  if exists (select 1 from public.payments where order_id = o.id) then raise exception 'FAIL: no_payment_rows'; end if;
  if public.counter_owed(o.id) <> 300 or public.customer_balance(cust) <> b0 + 300 then raise exception 'FAIL: owed %', public.counter_owed(o.id); end if;
  begin
    perform * from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', a, 'qty', 3)), '[{"method":"On account","amount":300}]'::jsonb, cust);
    raise exception 'FAIL: over_limit';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  -- part paid, the rest on account
  select * into r from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', a, 'qty', 2)), '[{"method":"Cash","amount":50},{"method":"On account","amount":150}]'::jsonb, cust);
  if public.counter_owed(r.order_id) <> 150 then raise exception 'FAIL: part_paid'; end if;
  update public.store_settings set counter_credit = false where id = 1;
  begin
    perform * from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', a, 'qty', 1)), '[{"method":"On account","amount":100}]'::jsonb, cust);
    raise exception 'FAIL: credit_off';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  update public.store_settings set counter_credit = true where id = 1;

  -- the invoice is issued at the sale, owed or not (time of supply)
  set constraints all immediate;
  if (select invoice_number from public.orders where id = o.id) is null then raise exception 'FAIL: credit_sale_invoiced'; end if;

  -- collecting: oldest sale first, recorded, cash in the drawer
  pay := public.counter_collect(cust, 100, 'Cash', '');
  if public.counter_owed(o.id) <> 200 then raise exception 'FAIL: collect_oldest_first %', public.counter_owed(o.id); end if;
  if (select balance_after from public.counter_credit_payments where id = pay) <> public.customer_balance(cust) then raise exception 'FAIL: balance_after'; end if;
  if not exists (select 1 from public.payments where order_id = o.id and provider = 'credit' and amount = 100) then raise exception 'FAIL: credit_payment_row'; end if;
  begin
    perform public.counter_collect(cust, 1000000, 'Cash', '');
    raise exception 'FAIL: collect_too_much';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  if not exists (select 1 from public.counter_balances() x where x.profile_id = cust) then raise exception 'FAIL: balances_list'; end if;

  -- a refund at the till: back in stock, credit note, cash out of the drawer
  select * into r from public.counter_sale(jsonb_build_array(jsonb_build_object('variant', b, 'qty', 2)), '[{"method":"Cash","amount":236}]'::jsonb);
  select id into it from public.order_items where order_id = r.order_id;
  select stock_qty into st from public.product_variants where id = b;
  rf := public.counter_refund(r.order_id, jsonb_build_array(jsonb_build_object('item', it, 'qty', 1)), 118, 'Cash', true, 'Didn''t fit');
  if (select stock_qty from public.product_variants where id = b) <> st + 1 then raise exception 'FAIL: restocked'; end if;
  if (select method from public.counter_refund_pays where refund_id = rf) <> 'Cash' then raise exception 'FAIL: refund_method'; end if;
  set constraints all immediate;
  if not exists (select 1 from public.credit_notes where refund_id = rf) then raise exception 'FAIL: credit_note'; end if;
  -- on account: only up to what's owed
  begin
    perform public.counter_refund(o.id, '[]'::jsonb, 250, 'On account', false, '');
    raise exception 'FAIL: on_account_refund_over_owed';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform public.counter_refund(o.id, '[]'::jsonb, 50, 'On account', false, 'Price match');
  if public.counter_owed(o.id) <> 150 then raise exception 'FAIL: refund_off_account %', public.counter_owed(o.id); end if;

  -- voids are recorded
  perform public.counter_void('line', jsonb_build_array(jsonb_build_object('variant', a, 'name', 'Till two', 'qty', 1, 'value', 100)), '');
  perform public.counter_void('order', jsonb_build_array(jsonb_build_object('variant', b, 'name', 'Till two', 'qty', 2, 'value', 236)), 'Changed mind');
  if (select count(*) from public.counter_voids where session_id = sess) <> 2 then raise exception 'FAIL: voids'; end if;

  -- the drawer: sales, on account, collections and the till's refunds
  t := public.counter_totals(sess);
  if (t ->> 'cash_collected')::numeric <> 100 then raise exception 'FAIL: cash_collected %', t ->> 'cash_collected'; end if;
  if (t ->> 'on_account')::numeric <> 450 then raise exception 'FAIL: on_account %', t ->> 'on_account'; end if;
  if (t ->> 'cash_refunds')::numeric <> 118 then raise exception 'FAIL: cash_refunds %', t ->> 'cash_refunds'; end if;
  if (t ->> 'expected_cash')::numeric <> 100 + 180 + 50 + 236 + 100 - 118 then raise exception 'FAIL: expected %', t ->> 'expected_cash'; end if;

  -- every report runs; the ones about this test see it
  perform public.admin_till_report(k, current_date - 1, current_date + 1, 'all', null)
     from unnest(array['daily', 'hourly', 'hourly_groups', 'pay_types', 'pay_users', 'pay_customers', 'users', 'items', 'discounts',
                       'item_discounts', 'till_refunds', 'unpaid', 'collected', 'floats', 'cash_moves', 'voids']) k;
  select count(*) into n from public.admin_till_report('discounts', current_date - 1, current_date + 1, 'counter', adm) x where x ->> 'discount' = '20.00' or (x ->> 'discount')::numeric = 20;
  if n < 1 then raise exception 'FAIL: discounts_report'; end if;
  select count(*) into n from public.admin_till_report('unpaid', current_date - 1, current_date + 1, 'all', null) x where x ->> 'order_id' = o.id::text;
  if n <> 1 then raise exception 'FAIL: unpaid_report'; end if;
  select count(*) into n from public.admin_till_report('voids', current_date - 1, current_date + 1, 'all', adm);
  if n < 2 then raise exception 'FAIL: voids_report'; end if;
  select count(*) into n from public.admin_till_report('collected', current_date - 1, current_date + 1, 'all', null) x where (x ->> 'amount')::numeric = 100;
  if n < 1 then raise exception 'FAIL: collected_report'; end if;
  select count(*) into n from public.admin_till_report('daily', current_date - 1, current_date + 1, 'online', adm) x;
  -- (online sales by this admin may exist on live; the call just has to work)

  -- online orders untouched
  select * into r from public.admin_create_order(null, '{"name":"Online","phone":"9000000001","email":"o@example.com"}'::jsonb,
    '{"line1":"1 Road","city":"Pune","state":"Maharashtra","pincode":"411001"}'::jsonb, jsonb_build_array(jsonb_build_object('variant', a, 'qty', 1)), null, '', false);
  select * into o from public.orders where id = r.order_id;
  if o.channel <> 'online' or o.counter_on_account or o.counter_cashier is not null or o.status <> 'pending' then raise exception 'FAIL: online_unchanged'; end if;
  if (select list_price from public.order_items where order_id = o.id) is not null then raise exception 'FAIL: online_no_list_price'; end if;
end $$;
select 'ok' where false;
