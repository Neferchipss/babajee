-- Tests for migration 0069 (live view). Rolled back. Empty response: passed.
do $$
declare
  adm uuid;
  cust uuid;
  r jsonb;
  got boolean;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  select id into cust from public.profiles where role = 'customer' limit 1;
  insert into public.site_events (session_id, kind, path, device, label) values
    ('zz-live-1', 'view', '/shop/bong/', 'mobile', ''),
    ('zz-live-1', 'product', '/shop/bong/?p=x', 'mobile', 'Glass Beaker'),
    ('zz-live-1', 'add', '/shop/bong/?p=x', 'mobile', 'Glass Beaker');
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  r := public.admin_live_view(5);
  if (r ->> 'visitors')::int < 1 then raise exception 'FAIL: visitor_counted %', r; end if;
  if not exists (select 1 from jsonb_array_elements(r -> 'sessions') s where s ->> 'session' = 'zz-live-1' and s ->> 'looking_at' = 'Glass Beaker' and (s ->> 'adds')::int = 1 and s ->> 'device' = 'mobile') then
    raise exception 'FAIL: session_detail %', r -> 'sessions'; end if;
  if (r -> 'today' ->> 'visits')::int < 1 then raise exception 'FAIL: today'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  got := false;
  begin
    perform public.admin_live_view(5);
  exception when insufficient_privilege then got := true; end;
  if not got then raise exception 'FAIL: not_admin'; end if;
end $$;
