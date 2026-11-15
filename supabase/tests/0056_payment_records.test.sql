-- 0056: "Mark paid" records the method, reference and day; any other path to
-- paid records the amount with no method; going back to unpaid voids it.
-- Run with: bash scripts/test-sql.sh supabase/migrations/0056_payment_records.sql supabase/tests/0056_payment_records.test.sql
do $$
declare
  a uuid; b uuid; admin_id uuid; p record; n int;
begin
  update public.email_config set enabled = false where id = 1;
  select id into admin_id from public.profiles where role = 'admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin_id::text, true);

  insert into public.orders (contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total, is_test)
  values ('A', 'a@example.com', '9000000001', 'x', 'Pune', 'Maharashtra', '411001', 1198, 0, 0, 1198, true) returning id into a;
  insert into public.orders (contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total, is_test)
  values ('B', 'b@example.com', '9000000002', 'x', 'Pune', 'Maharashtra', '411001', 500, 0, 0, 500, true) returning id into b;

  -- the form
  perform public.admin_mark_paid(a, 'UPI', '412345678901', null, 'Paid on call');
  select * into p from public.payments where order_id = a;
  if p.method <> 'UPI' or p.reference <> '412345678901' or p.amount <> 1198 or p.status <> 'captured' then
    raise exception 'FAIL: form payment wrong: % % % %', p.method, p.reference, p.amount, p.status;
  end if;
  if p.received_on <> (now() at time zone 'Asia/Kolkata')::date then raise exception 'FAIL: day %', p.received_on; end if;
  if (select status from public.orders where id = a) <> 'paid' then raise exception 'FAIL: not paid'; end if;
  if not exists (select 1 from public.order_events where order_id = a and status = 'paid' and note like 'Paid by UPI · ref 412345678901%') then raise exception 'FAIL: event note'; end if;

  -- not twice
  begin
    perform public.admin_mark_paid(a, 'Cash');
    raise exception 'FAIL: paid twice';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- a method is needed
  begin
    perform public.admin_mark_paid(b, '  ');
    raise exception 'FAIL: no method accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;

  -- another path (bulk / the road): amount, no method
  perform public.admin_update_order(b, 'paid', '', null, null, false);
  select count(*) into n from public.payments where order_id = b and status = 'captured' and method = '' and amount = 500;
  if n <> 1 then raise exception 'FAIL: bulk path recorded % rows', n; end if;

  -- back to unpaid: void
  perform public.admin_set_step(b, 'pending', '', null, null);
  if exists (select 1 from public.payments where order_id = b and status = 'captured') then raise exception 'FAIL: not voided'; end if;
  if not exists (select 1 from public.payments where order_id = b and status = 'void') then raise exception 'FAIL: void row missing'; end if;

  -- every paid order has its row
  if exists (select 1 from public.orders o where o.paid_total is not null and not exists (select 1 from public.payments x where x.order_id = o.id and x.status = 'captured')) then
    raise exception 'FAIL: a paid order has no payment row';
  end if;
end $$;
