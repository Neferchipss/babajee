-- Tests for 0079 (couriers list, hiding an account). Rolled back. Empty response: passed.
do $$
declare
  adm uuid; cu uuid;
  got boolean;
begin
  select id into adm from public.profiles where role = 'admin' and coalesce(staff_role, 'admin') in ('owner', 'admin') limit 1;
  select id into cu from public.profiles where role = 'customer' limit 1;

  -- the default list is there, and an empty name is refused
  if cardinality((select couriers from public.store_settings where id = 1)) < 1 then raise exception 'FAIL: default_couriers'; end if;
  got := false;
  begin
    update public.store_settings set couriers = array['Delhivery', ''] where id = 1;
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: empty_courier_refused'; end if;

  -- an admin hides and unhides an account
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform public.admin_set_hidden(cu, true);
  if not (select hidden from public.profiles where id = cu) then raise exception 'FAIL: hidden_on'; end if;
  perform public.admin_set_hidden(cu, false);
  if (select hidden from public.profiles where id = cu) then raise exception 'FAIL: hidden_off'; end if;

  -- a customer can't
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  got := false;
  begin
    perform public.admin_set_hidden(cu, true);
  exception when insufficient_privilege then got := true; end;
  if not got then raise exception 'FAIL: customer_refused'; end if;
end $$;
select 'ok' where false;
