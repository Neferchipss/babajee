-- Tests for migration 0075 (two-step sign-in removed). Rolled back. Empty: passed.
do $$
declare
  own uuid;
begin
  select id into own from public.profiles where role = 'admin' order by created_at limit 1;
  update public.profiles set staff_role = 'owner' where id = own;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'store_settings' and column_name = 'staff_2fa') then
    raise exception 'FAIL: staff_2fa still there';
  end if;

  -- staff on a plain sign-in (aal1), even with an authenticator app set up
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  if public.staff_role() is distinct from 'owner' then raise exception 'FAIL: staff_role %', public.staff_role(); end if;
  if not public.is_admin() then raise exception 'FAIL: is_admin on aal1'; end if;
  if not (public.my_staff() ->> 'active')::boolean or public.my_staff() ? 'required' then
    raise exception 'FAIL: my_staff %', public.my_staff();
  end if;
  if public.admin_team() -> 0 ? 'two_step' then raise exception 'FAIL: admin_team still has two_step'; end if;
end $$;
