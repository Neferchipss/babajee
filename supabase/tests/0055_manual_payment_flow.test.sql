-- 0055: unpaid orders expire after store_settings.unpaid_hours and give their
-- stock back; test orders and fresh orders are left alone; 0 turns it off.
-- Run with: bash scripts/test-sql.sh supabase/migrations/0055_manual_payment_flow.sql supabase/tests/0055_manual_payment_flow.test.sql
do $$
declare
  old_o uuid; new_o uuid; test_o uuid; v uuid; before int; after int; n int; note text;
begin
  -- no emails from the test
  update public.email_config set enabled = false where id = 1;

  -- a tracked option to order from
  select pv.id into v from public.product_variants pv limit 1;
  update public.product_variants set track_stock = true, stock_qty = 10 where id = v;

  insert into public.orders (contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total, is_test, created_at)
  values ('Old', 'old@example.com', '9000000001', 'x', 'Pune', 'Maharashtra', '411001', 100, 0, 0, 100, false, now() - interval '49 hours')
  returning id into old_o;
  insert into public.orders (contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total, is_test, created_at)
  values ('New', 'new@example.com', '9000000002', 'x', 'Pune', 'Maharashtra', '411001', 100, 0, 0, 100, false, now() - interval '2 hours')
  returning id into new_o;
  insert into public.orders (contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total, is_test, created_at)
  values ('Test', 'test@example.com', '9000000003', 'x', 'Pune', 'Maharashtra', '411001', 100, 0, 0, 100, true, now() - interval '90 hours')
  returning id into test_o;
  insert into public.order_items (order_id, variant_id, product_name, unit_price, quantity)
  values (old_o, v, 'Thing', 100, 3);
  -- placing took the stock down
  update public.product_variants set stock_qty = 7 where id = v;
  select stock_qty into before from public.product_variants where id = v;

  update public.store_settings set unpaid_hours = 48 where id = 1;
  n := public.expire_unpaid_orders();

  if (select status from public.orders where id = old_o) <> 'cancelled' then raise exception 'FAIL: old unpaid order not cancelled'; end if;
  if (select status from public.orders where id = new_o) <> 'pending' then raise exception 'FAIL: fresh order was cancelled'; end if;
  if (select status from public.orders where id = test_o) <> 'pending' then raise exception 'FAIL: test order was cancelled'; end if;
  select stock_qty into after from public.product_variants where id = v;
  if after <> before + 3 then raise exception 'FAIL: stock not put back (% -> %)', before, after; end if;
  select e.note into note from public.order_events e where e.order_id = old_o and e.status = 'cancelled';
  if note is distinct from 'Not paid within 48 hours' then raise exception 'FAIL: cancel note is %', note; end if;
  if n < 1 then raise exception 'FAIL: count %', n; end if;

  -- 0 hours: never expires
  update public.orders set created_at = now() - interval '500 hours' where id = new_o;
  update public.store_settings set unpaid_hours = 0 where id = 1;
  perform public.expire_unpaid_orders();
  if (select status from public.orders where id = new_o) <> 'pending' then raise exception 'FAIL: expired with 0 hours'; end if;

  -- the job is scheduled
  if not exists (select 1 from cron.job where jobname = 'babajee-expire-unpaid') then raise exception 'FAIL: no cron job'; end if;
end $$;
