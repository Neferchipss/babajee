-- Tests for migration 0072 (staff roles, two-step). Rolled back. Empty: passed.
do $$
declare
  own uuid; acc uuid; sf uuid; fe uuid; cust uuid;
  em text;
  got boolean;
  n int;
  pid uuid;
  ids uuid[];
begin
  select id into own from public.profiles where role = 'admin' order by created_at limit 1;
  select array_agg(id) into ids from (select id from public.profiles where role = 'customer' order by created_at limit 4) x;
  acc := ids[1]; sf := ids[2]; fe := ids[3]; cust := ids[4];

  -- existing_admins_are_owners
  if (select staff_role from public.profiles where id = own) <> 'owner' then raise exception 'FAIL: existing_admins_are_owners'; end if;

  -- set up roles directly (no signed-in user)
  update public.profiles set role = 'admin', staff_role = 'accounts' where id = acc;
  update public.profiles set role = 'admin', staff_role = 'storefront' where id = sf;
  update public.profiles set role = 'admin', staff_role = 'frontend' where id = fe;

  -- accounts: an admin for money, not for settings, delete or downloads
  perform set_config('request.jwt.claims', json_build_object('sub', acc, 'role', 'authenticated')::text, true);
  if not public.is_admin() then raise exception 'FAIL: accounts_is_admin'; end if;
  set local role authenticated;
  update public.store_settings set return_days = return_days where id = 1;
  get diagnostics n = row_count;
  reset role;
  if n <> 0 then raise exception 'FAIL: accounts_cant_save_settings'; end if;
  got := false;
  begin
    perform public.admin_export_tables();
  exception when insufficient_privilege then got := true; end;
  if not got then raise exception 'FAIL: accounts_cant_download_all'; end if;
  insert into public.categories (slug, name) values ('zz-0072', 'T') returning id into pid;
  insert into public.products (category_id, slug, name) values (pid, 'zz-0072-p', 'P') returning id into pid;
  got := false;
  begin
    delete from public.products where id = pid;
  exception when insufficient_privilege then got := true; end;
  if not got then raise exception 'FAIL: accounts_cant_delete_product'; end if;
  got := false;
  begin
    perform public.admin_set_staff('nobody@example.com', 'frontend');
  exception when insufficient_privilege then got := true; end;
  if not got then raise exception 'FAIL: accounts_cant_change_team'; end if;

  -- storefront: catalogue yes, admin functions and costs no
  perform set_config('request.jwt.claims', json_build_object('sub', sf, 'role', 'authenticated')::text, true);
  if public.is_admin() then raise exception 'FAIL: storefront_not_admin'; end if;
  if not public.staff_can('catalog') or not public.staff_can('content') then raise exception 'FAIL: storefront_can_catalog'; end if;
  set local role authenticated;
  update public.products set name = 'P2' where id = pid;
  get diagnostics n = row_count;
  select count(*) into n from public.variant_costs;
  reset role;
  if (select name from public.products where id = pid) <> 'P2' then raise exception 'FAIL: storefront_edits_products'; end if;
  if n <> 0 then raise exception 'FAIL: storefront_cant_see_costs (%)', n; end if;
  got := false;
  begin
    perform public.admin_carts();
  exception when insufficient_privilege then got := true; end;
  if not got then raise exception 'FAIL: storefront_cant_see_carts'; end if;

  -- frontend: look only
  perform set_config('request.jwt.claims', json_build_object('sub', fe, 'role', 'authenticated')::text, true);
  if public.staff_can('catalog') or not public.staff_can('look') then raise exception 'FAIL: frontend_look_only'; end if;
  set local role authenticated;
  update public.products set name = 'P3' where id = pid;
  reset role;
  if (select name from public.products where id = pid) <> 'P2' then raise exception 'FAIL: frontend_cant_edit_products'; end if;

  -- roles can't be changed by hand
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  got := false;
  begin
    update public.profiles set staff_role = 'owner' where id = fe;
  exception when insufficient_privilege then got := true; end;
  if not got then raise exception 'FAIL: roles_only_through_team'; end if;

  -- owner sets roles; an admin can't touch owners/admins
  select u.email into em from auth.users u where u.id = cust;
  perform public.admin_set_staff(em, 'admin');
  if (select role || '/' || staff_role from public.profiles where id = cust) <> 'admin/admin' then raise exception 'FAIL: owner_sets_role'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  got := false;
  begin
    perform public.admin_set_staff((select email from auth.users where id = own), null);
  exception when insufficient_privilege then got := true; end;
  if not got then raise exception 'FAIL: admin_cant_remove_owner'; end if;
  perform public.admin_set_staff((select email from auth.users where id = fe), 'storefront');
  if (select staff_role from public.profiles where id = fe) <> 'storefront' then raise exception 'FAIL: admin_sets_lower_roles'; end if;
  perform public.admin_set_staff((select email from auth.users where id = fe), null);
  if (select role from public.profiles where id = fe) <> 'customer' or (select staff_role from public.profiles where id = fe) is not null then raise exception 'FAIL: removed'; end if;

  -- two-step required: aal1 isn't staff, aal2 is
  update public.store_settings set staff_2fa = true where id = 1;
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  if public.is_admin() then raise exception 'FAIL: two_step_required'; end if;
  if not (public.my_staff() ->> 'required')::boolean or (public.my_staff() ->> 'active')::boolean then raise exception 'FAIL: my_staff %', public.my_staff(); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  if not public.is_admin() then raise exception 'FAIL: two_step_passed'; end if;
  if jsonb_array_length(public.admin_team()) < 2 then raise exception 'FAIL: team'; end if;
end $$;
