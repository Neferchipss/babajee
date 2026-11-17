-- Tests for migration 0066 (customers). Run through scripts/test-sql.sh: one
-- transaction, rolled back. Empty response: passed.

do $$
declare
  adm uuid;
  cust uuid;
  o uuid;
  a1 uuid; a2 uuid;
  got boolean;
  r record;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  select id into cust from public.profiles where role = 'customer' and id <> adm limit 1;
  if cust is null then raise exception 'FAIL: setup (no customer profile)'; end if;

  -- names_split_and_join: a full name alone is split; first + last make it
  update public.profiles set first_name = '', last_name = '', full_name = 'Asha  Rani Verma' where id = cust;
  select * into r from public.profiles where id = cust;
  if not (r.first_name = 'Asha' and r.last_name = 'Rani Verma' and r.full_name = 'Asha  Rani Verma') then
    raise exception 'FAIL: names_split (% / % / %)', r.first_name, r.last_name, r.full_name; end if;
  update public.profiles set first_name = 'Asha', last_name = 'Verma' where id = cust;
  if (select full_name from public.profiles where id = cust) <> 'Asha Verma' then raise exception 'FAIL: names_join'; end if;

  -- sign_up_still_works: 0058's complete_profile (full name in one) splits too
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  perform public.complete_profile('Ravi Kumar', '9876543210', null);
  select * into r from public.profiles where id = cust;
  if not (r.first_name = 'Ravi' and r.last_name = 'Kumar') then raise exception 'FAIL: sign_up_still_works'; end if;

  -- customer_can_edit_own_details_not_status
  set local role authenticated;
  update public.profiles set gender = 'female', customer_type = 'business', business_name = 'Ravi Traders', gstin = '27abcde1234f1z5' where id = cust;
  got := false;
  begin
    update public.profiles set status = 'active' where id = cust;
  exception when insufficient_privilege then got := true; end;
  reset role;
  if not got then raise exception 'FAIL: customer_cant_change_status'; end if;
  select * into r from public.profiles where id = cust;
  if not (r.gender = 'female' and r.customer_type = 'business' and r.gstin = '27ABCDE1234F1Z5') then raise exception 'FAIL: own_details (% % %)', r.gender, r.customer_type, r.gstin; end if;

  -- bad_values_refused
  got := false;
  begin
    update public.profiles set gstin = 'NOPE' where id = cust;
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: gstin_format'; end if;

  -- business_gstin_on_orders: their own new order carries it
  insert into public.orders (profile_id, contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total)
  values (cust, 'R', 'r@example.com', '9876543210', 'x', 'Pune', 'Maharashtra', '411001', 100, 0, 0, 100) returning id into o;
  if (select buyer_gstin from public.orders where id = o) <> '27ABCDE1234F1Z5' then raise exception 'FAIL: business_gstin_on_orders'; end if;

  -- billing_on_own_pending_order
  perform public.set_order_billing(o, jsonb_build_object('name', 'Ravi Traders', 'line1', 'Shop 4', 'city', 'Mumbai', 'state', 'Maharashtra', 'pincode', '400001'));
  if not (select billing_city = 'Mumbai' and billing_pincode = '400001' from public.orders where id = o) then raise exception 'FAIL: billing_on_own_pending_order'; end if;
  got := false;
  begin
    perform public.set_order_billing(o, jsonb_build_object('line1', 'Shop 4', 'city', 'Mumbai', 'state', 'Maharashtra', 'pincode', '12'));
  exception when others then got := sqlerrm like 'Add the billing address%'; end;
  if not got then raise exception 'FAIL: billing_pincode_checked'; end if;

  -- blocked_customer_cant_order: the shop blocks them; their own order is refused
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform public.admin_update_customer(cust, jsonb_build_object('status', 'blocked', 'status_note', 'test'));
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  got := false;
  begin
    insert into public.orders (profile_id, contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total)
    values (cust, 'R', 'r@example.com', '9876543210', 'x', 'Pune', 'Maharashtra', '411001', 100, 0, 0, 100);
  exception when others then got := sqlerrm like 'This account can''t place orders%'; end;
  if not got then raise exception 'FAIL: blocked_customer_cant_order'; end if;

  -- shop_can_still_order_for_them
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  insert into public.orders (profile_id, contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total)
  values (cust, 'R', 'r@example.com', '9876543210', 'x', 'Pune', 'Maharashtra', '411001', 100, 0, 0, 100);

  -- not_admin_cant_update_customer
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  got := false;
  begin
    perform public.admin_update_customer(cust, jsonb_build_object('status', 'active'));
  exception when insufficient_privilege then got := true; end;
  if not got then raise exception 'FAIL: not_admin_cant_update_customer'; end if;

  -- one_default_billing
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  insert into public.addresses (profile_id, recipient_name, phone, line1, city, state, pincode, is_default_billing)
  values (cust, 'A', '9876543210', 'One', 'Pune', 'Maharashtra', '411001', true) returning id into a1;
  insert into public.addresses (profile_id, recipient_name, phone, line1, city, state, pincode, is_default_billing)
  values (cust, 'B', '9876543210', 'Two', 'Pune', 'Maharashtra', '411002', true) returning id into a2;
  if (select is_default_billing from public.addresses where id = a1) then raise exception 'FAIL: one_default_billing'; end if;
end $$;
