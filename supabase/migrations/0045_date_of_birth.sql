-- Date of birth, asked at sign-up (required on the form) to store each
-- customer's age and to check they are 18 or older.
--
-- 1. profiles.date_of_birth (date). Customers can't change it themselves:
--    their update grant covers only full_name and phone (0001), so it is
--    set once, at sign-up. An admin's tools may correct it later.
-- 2. handle_new_user() copies it from the sign-up form (user metadata
--    "date_of_birth", yyyy-mm-dd), and a date that isn't one, is in the
--    future, before 1900 or under 18 years ago refuses the sign-up. An
--    account made without one (an admin adding a customer by hand) is let
--    through with none.
-- 3. A before insert/update check on profiles keeps the same rule for any
--    other way a date gets in.
-- 4. admin_customers() returns it (the list and each customer's page show
--    the age).
--
-- Check (read-only) afterwards:
--   select column_name, data_type from information_schema.columns
--    where table_schema = 'public' and table_name = 'profiles' and column_name = 'date_of_birth';  -- 1 row, date

-- ---------------------------------------------------------------- 1. the column

alter table public.profiles add column if not exists date_of_birth date;

-- ---------------------------------------------------------------- 3. the rule

create or replace function public.check_date_of_birth()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.date_of_birth is not null then
    if new.date_of_birth > current_date or new.date_of_birth < date '1900-01-01' then
      raise exception 'That date of birth isn''t right.' using errcode = '22008';
    end if;
    if new.date_of_birth > (current_date - interval '18 years')::date then
      raise exception 'Babajee is for adults only: you must be 18 or older.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_check_date_of_birth on public.profiles;
create trigger profiles_check_date_of_birth
  before insert or update of date_of_birth on public.profiles
  for each row execute function public.check_date_of_birth();

-- ---------------------------------------------------------------- 2. sign-up

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  given text := nullif(trim(new.raw_user_meta_data ->> 'date_of_birth'), '');
  dob date;
begin
  if given is not null then
    begin
      dob := given::date;
    exception when others then
      raise exception 'That date of birth isn''t right.' using errcode = '22008';
    end;
  end if;
  insert into public.profiles (id, full_name, phone, age_verified_at, date_of_birth)
  values (
    new.id,
    coalesce(left(new.raw_user_meta_data ->> 'full_name', 120), ''),
    coalesce(left(new.raw_user_meta_data ->> 'phone', 32), ''),
    -- a date of birth of 18+ years ago is the age check; the old tick still counts
    case when dob is not null or (new.raw_user_meta_data ->> 'age_confirmed') = 'true' then now() end,
    dob
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------- 4. the admin's customer list

drop function if exists public.admin_customers();

create or replace function public.admin_customers()
returns table (id uuid, full_name text, phone text, email text, role text, joined timestamptz,
               orders bigint, spent numeric, last_order timestamptz, is_test boolean,
               tags text[], city text, state text, date_of_birth date)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.phone, coalesce(u.email, '')::text, p.role, p.created_at,
           count(o.id), coalesce(sum(o.total) filter (where o.status not in ('cancelled', 'refunded')), 0),
           max(o.created_at), p.is_test, p.tags,
           coalesce(a.city, lo.address_city, ''), coalesce(a.state, lo.address_state, ''),
           p.date_of_birth
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.orders o on o.profile_id = p.id
      left join lateral (
        select ad.city, ad.state from public.addresses ad
         where ad.profile_id = p.id order by ad.is_default desc, ad.created_at desc limit 1) a on true
      left join lateral (
        select x.address_city, x.address_state from public.orders x
         where x.profile_id = p.id order by x.created_at desc limit 1) lo on true
     group by p.id, u.email, a.city, a.state, lo.address_city, lo.address_state
     order by max(o.created_at) desc nulls last, p.created_at desc;
end;
$$;

revoke all on function public.admin_customers() from public, anon;
grant execute on function public.admin_customers() to authenticated;
