-- Tests for migration 0068 (insight reports). Run through scripts/test-sql.sh:
-- one transaction, rolled back. Empty response: passed.

do $$
declare
  adm uuid;
  cust uuid;
  o uuid;
  it uuid;
  v uuid;
  k text;
  r jsonb;
  got boolean;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  select id into cust from public.profiles where role = 'customer' and not coalesce(is_test, false) and not hidden limit 1;

  -- slug_from_path
  if public.slug_from_path('/shop/bong/?p=glass-beaker') <> 'glass-beaker' then raise exception 'FAIL: slug_query'; end if;
  if public.slug_from_path('/shop/bong/glass-beaker/') <> 'glass-beaker' then raise exception 'FAIL: slug_path'; end if;

  -- every kind gives an array
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  foreach k in array array['product_funnel', 'exit_pages', 'worst_sellers', 'returns', 'return_reasons', 'new_customers', 'marketing', 'refunds'] loop
    r := public.admin_insights(k, today - 365, today);
    if jsonb_typeof(r) <> 'array' then raise exception 'FAIL: kind % gave %', k, jsonb_typeof(r); end if;
  end loop;
  if jsonb_array_length(public.admin_insights('worst_sellers', today - 30, today)) = 0 then raise exception 'FAIL: worst_sellers_lists_products'; end if;

  -- a return with a picked reason
  select pv.id into v from public.product_variants pv join public.products p on p.id = pv.product_id where pv.unit_variant_id is null limit 1;
  insert into public.orders (profile_id, contact_name, contact_email, contact_phone, address_line1, address_city, address_state, address_pincode, subtotal, shipping, tax, total)
  values (cust, 'R', 'r@example.com', '9876543210', 'x', 'Pune', 'Maharashtra', '411001', 100, 0, 0, 100) returning id into o;
  insert into public.order_items (order_id, variant_id, product_name, unit_price, quantity) values (o, v, 'Thing', 100, 2) returning id into it;
  update public.orders set status = 'delivered' where id = o;
  update public.store_settings set return_days = 7 where id = 1;
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  got := false;
  begin
    perform public.customer_request_return(o, jsonb_build_array(jsonb_build_object('item', it, 'qty', 1)), 'Cracked', 'nonsense');
  exception when others then got := sqlerrm like 'Pick a reason%'; end;
  if not got then raise exception 'FAIL: bad_reason_refused'; end if;
  perform public.customer_request_return(o, jsonb_build_array(jsonb_build_object('item', it, 'qty', 1)), 'Cracked', 'damaged');
  if (select reason_code from public.order_requests where order_id = o and kind = 'return') <> 'damaged' then raise exception 'FAIL: reason_code_saved'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  r := public.admin_insights('return_reasons', today - 1, today);
  if not exists (select 1 from jsonb_array_elements(r) e where e ->> 'reason' = 'damaged' and (e ->> 'units')::int >= 1) then raise exception 'FAIL: return_reasons %', r; end if;
  r := public.admin_insights('returns', today - 1, today);
  if not exists (select 1 from jsonb_array_elements(r) e where (e ->> 'returned')::int >= 1 and e ->> 'reasons' like '%damaged%') then raise exception 'FAIL: returns %', r; end if;

  -- not_admin
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  got := false;
  begin
    perform public.admin_insights('refunds', today - 1, today);
  exception when insufficient_privilege then got := true; end;
  if not got then raise exception 'FAIL: not_admin'; end if;
end $$;
