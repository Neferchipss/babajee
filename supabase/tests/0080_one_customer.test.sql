-- Tests for 0080 (one customer). Rolled back. Empty response: passed.
do $$
declare
  adm uuid; cu uuid;
  a record; b record;
  got boolean;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  select p.id into cu from public.profiles p where p.role = 'customer' and not p.hidden and exists (select 1 from public.orders o where o.profile_id = p.id) limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);

  -- the same row as the full list gives
  select * into a from public.admin_customer(cu);
  select * into b from public.admin_customers() x where x.id = cu;
  if a.id is distinct from cu or a.orders <> b.orders or a.spent <> b.spent or a.email <> b.email or a.city <> b.city then
    raise exception 'FAIL: same_as_list (% % / % %)', a.orders, a.spent, b.orders, b.spent;
  end if;
  if (select count(*) from public.admin_customer(gen_random_uuid())) <> 0 then raise exception 'FAIL: unknown_is_empty'; end if;

  -- a customer can't
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  got := false;
  begin
    perform * from public.admin_customer(cu);
  exception when insufficient_privilege then got := true; end;
  if not got then raise exception 'FAIL: customer_refused'; end if;
end $$;
select 'ok' where false;
