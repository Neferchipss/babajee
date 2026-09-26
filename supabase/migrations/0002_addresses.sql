-- Customer addresses and admin notes. Depends on 0001_profiles.sql.

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  recipient_name text not null,
  phone text not null,
  line1 text not null,
  line2 text not null default '',
  landmark text not null default '',
  city text not null,
  state text not null,
  pincode text not null,
  country text not null default 'India',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists addresses_profile_id_idx on public.addresses (profile_id);

drop trigger if exists addresses_touch_updated_at on public.addresses;
create trigger addresses_touch_updated_at
  before update on public.addresses
  for each row execute function public.touch_updated_at();

-- Only one default address per customer.
create or replace function public.enforce_single_default_address()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_default then
    update public.addresses
      set is_default = false
      where profile_id = new.profile_id and id <> new.id and is_default;
  end if;
  return new;
end;
$$;

drop trigger if exists addresses_single_default on public.addresses;
create trigger addresses_single_default
  before insert or update on public.addresses
  for each row execute function public.enforce_single_default_address();

alter table public.addresses enable row level security;

drop policy if exists "read own addresses" on public.addresses;
create policy "read own addresses" on public.addresses
  for select to authenticated
  using ((select auth.uid()) = profile_id);

drop policy if exists "manage own addresses" on public.addresses;
create policy "manage own addresses" on public.addresses
  for all to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

drop policy if exists "admins read all addresses" on public.addresses;
create policy "admins read all addresses" on public.addresses
  for select to authenticated
  using (public.is_admin());

revoke all on public.addresses from anon;
grant select, insert, update, delete on public.addresses to authenticated;

-- Admin-only notes about a customer. Never shown to the customer.
create table if not exists public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists customer_notes_profile_id_idx on public.customer_notes (profile_id);

alter table public.customer_notes enable row level security;

drop policy if exists "admins manage customer notes" on public.customer_notes;
create policy "admins manage customer notes" on public.customer_notes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.customer_notes from anon, authenticated;
grant select, insert, update, delete on public.customer_notes to authenticated;

-- Verify:
--   select tgname from pg_trigger where tgrelid = 'public.addresses'::regclass order by 1;  -- 2 rows
--   select policyname from pg_policies where tablename = 'addresses' order by 1;              -- 3 rows
--   select policyname from pg_policies where tablename = 'customer_notes';                     -- 1 row
