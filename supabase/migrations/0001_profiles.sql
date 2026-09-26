-- Babajee accounts: one profile row per signed-up user.
-- Run this once in the Supabase SQL editor (or `supabase db push`), then check
-- the "Verify" queries at the bottom.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  role text not null default 'customer' check (role in ('customer', 'admin')),
  -- When the person ticked "I am 18 or older". A declaration, not a date of birth.
  age_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Admin check used by policies here and, later, on the catalogue and orders.
-- SECURITY DEFINER so it can read profiles without tripping the policies below.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Create the profile when someone signs up. Name, phone and the 18+ tick come
-- from the sign-up form; the role is never read from user-supplied data.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone, age_verified_at)
  values (
    new.id,
    coalesce(left(new.raw_user_meta_data ->> 'full_name', 120), ''),
    coalesce(left(new.raw_user_meta_data ->> 'phone', 32), ''),
    case when (new.raw_user_meta_data ->> 'age_confirmed') = 'true' then now() end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Row access.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "admins read all profiles" on public.profiles;
create policy "admins read all profiles" on public.profiles
  for select to authenticated
  using (public.is_admin());

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Column access: a customer can change their name and phone, nothing else.
-- Role and age_verified_at can only be changed from the SQL editor or the
-- service role, so nobody can make themselves an admin from the browser.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- Verify (run these after the migration):
--   select tgname from pg_trigger where tgname = 'on_auth_user_created';
--   select relrowsecurity from pg_class where oid = 'public.profiles'::regclass;   -- true
--   select policyname from pg_policies where tablename = 'profiles';                -- 3 rows
--
-- Make the first admin (after that person has signed up):
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'owner@example.com');
