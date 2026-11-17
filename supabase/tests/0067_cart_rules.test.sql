-- Tests for migration 0067 (cart rules). Run through scripts/test-sql.sh: one
-- transaction, rolled back. Empty response: passed.

do $$
declare
  adm uuid;
  cust uuid;
  t0 timestamptz;
  r record;
  n int;
  got boolean;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  select id into cust from public.profiles where role = 'customer' and id <> adm and not coalesce(is_test, false) and not hidden limit 1;
  if cust is null then raise exception 'FAIL: setup (no customer)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);

  delete from public.carts where profile_id = cust;
  insert into public.carts (profile_id, lines) values (cust, '[{"key":"k","slug":"s","href":"/x","name":"Thing","variant":"","price":100,"qty":2}]');
  update public.carts set updated_at = now() - interval '3 days' where profile_id = cust;
  -- the trigger leaves a direct updated_at change alone only when lines did not change, so set it
  select updated_at into t0 from public.carts where profile_id = cust;

  -- reminded_keeps_updated_at
  perform public.admin_mark_cart_reminded(cust);
  select * into r from public.carts where profile_id = cust;
  if r.reminders <> 1 or r.reminded_at is null then raise exception 'FAIL: reminded'; end if;
  if r.updated_at <> t0 then raise exception 'FAIL: reminded_keeps_updated_at'; end if;

  -- listed_with_reminders
  select * into r from public.admin_carts() c where c.profile_id = cust;
  if r.reminders is distinct from 1 then raise exception 'FAIL: listed_with_reminders'; end if;

  -- expiry: 2 days rule empties a 3-day-old cart; 0 = never
  update public.store_settings set cart_expire_days = 0 where id = 1;
  if public.expire_old_carts() <> 0 then raise exception 'FAIL: never_expire'; end if;
  update public.store_settings set cart_expire_days = 2 where id = 1;
  n := public.expire_old_carts();
  if n < 1 or (select jsonb_array_length(lines) from public.carts where profile_id = cust) <> 0 then raise exception 'FAIL: expired (%)', n; end if;

  -- rules_checked
  got := false;
  begin
    update public.store_settings set cart_abandon_hours = 0 where id = 1;
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: rules_checked'; end if;

  -- conversion: counts come back, ordered <= visits
  select * into r from public.admin_cart_conversion(now() - interval '90 days', now() + interval '1 day');
  if r.visits is null or r.carted > r.visits or r.carted_ordered > r.carted then raise exception 'FAIL: conversion (% % %)', r.visits, r.carted, r.carted_ordered; end if;

  -- not_admin
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  got := false;
  begin
    perform public.admin_cart_conversion(now() - interval '1 day', now());
  exception when insufficient_privilege then got := true; end;
  if not got then raise exception 'FAIL: not_admin'; end if;
end $$;
