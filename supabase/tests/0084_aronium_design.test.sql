-- Tests for 0084 (two admin designs: Legacy and Aronium-style). Rolled back. Empty response: passed.
do $$
declare
  adm uuid; got boolean;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  -- a person can pick the new design for themselves
  set local role authenticated;
  update public.profiles set admin_design = 'aronium' where id = adm;
  reset role;
  if (select admin_design from public.profiles where id = adm) <> 'aronium' then raise exception 'FAIL: own_aronium_design'; end if;
  -- Legacy still works
  update public.profiles set admin_design = 'current' where id = adm;
  -- a removed design is refused
  got := false;
  begin
    update public.profiles set admin_design = 'studio' where id = adm;
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: removed_design_refused'; end if;
  -- an unknown design is still refused
  got := false;
  begin
    update public.profiles set admin_design = 'neon' where id = adm;
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: design_still_checked'; end if;
end $$;
select 'ok' where false;
