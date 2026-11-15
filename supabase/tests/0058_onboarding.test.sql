-- 0058: complete_profile sets name, phone and a first date of birth; won't
-- change a date already set; refuses under-18s and a missing sign-in.
-- Run with: bash scripts/test-sql.sh supabase/migrations/0058_onboarding.sql supabase/tests/0058_onboarding.test.sql
do $$
declare
  me uuid := gen_random_uuid(); p record;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (me, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'onb-test@example.com', '{}', now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', me::text, true);

  perform public.complete_profile('Asha Rao', '+91 98201 45566', date '1995-04-02');
  select * into p from public.profiles where id = me;
  if p.full_name <> 'Asha Rao' or p.phone <> '+91 98201 45566' or p.date_of_birth <> date '1995-04-02' or p.age_verified_at is null then
    raise exception 'FAIL: profile % % % %', p.full_name, p.phone, p.date_of_birth, p.age_verified_at;
  end if;

  -- the date can't be changed by the customer afterwards
  perform public.complete_profile('Asha R', '9820145566', date '2001-01-01');
  select * into p from public.profiles where id = me;
  if p.date_of_birth <> date '1995-04-02' or p.full_name <> 'Asha R' then raise exception 'FAIL: date changed or name not saved'; end if;

  -- under 18
  update public.profiles set date_of_birth = null where id = me;
  begin
    perform public.complete_profile('Kid', '9820145566', (current_date - interval '15 years')::date);
    raise exception 'FAIL: under-18 accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- a short phone
  begin
    perform public.complete_profile('Asha', '98201', null);
    raise exception 'FAIL: short phone accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
