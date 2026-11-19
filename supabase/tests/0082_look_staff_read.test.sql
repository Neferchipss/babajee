-- Tests for 0082 (front-end staff read hidden collections and categories). Rolled back. Empty response: passed.
do $$
declare
  adm uuid; cu uuid; c uuid; k uuid;
  got boolean;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  select id into cu from public.profiles where role = 'customer' limit 1;
  insert into public.collections (slug, name, is_visible) values ('zz-0082', 'Hidden shelf', false) returning id into c;
  insert into public.categories (slug, name, is_visible) values ('zz-0082-cat', 'Hidden type', false) returning id into k;
  update public.profiles set staff_role = 'frontend' where id = adm;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not exists (select 1 from public.collections where id = c) then raise exception 'FAIL: frontend_sees_hidden_collection'; end if;
  if not exists (select 1 from public.categories where id = k) then raise exception 'FAIL: frontend_sees_hidden_category'; end if;
  got := false;
  begin
    update public.collections set name = 'x' where id = c;
    got := not found;
  exception when others then got := true; end;
  if not got then raise exception 'FAIL: frontend_cannot_edit'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  if exists (select 1 from public.collections where id = c) then raise exception 'FAIL: customer_hidden'; end if;
  reset role;
end $$;
select 'ok' where false;
