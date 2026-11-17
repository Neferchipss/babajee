-- Staff roles, each with less than the one above, and two-step sign-in.
--
--   owner               everything, including who is on the team and their roles
--   admin               everything but owners and admins: can add and change
--                       store account, storefront manager and front-end staff
--   accounts            "store account": orders, customers, stock, purchases,
--                       prices and costs, GST, profit, reports. Not: settings,
--                       the team, data downloads, deleting products
--   storefront          "storefront manager": the catalogue (products, photos,
--                       categories, sub-categories, collections, bundles,
--                       reviews) and the shop's content (banners, pages, blog,
--                       FAQs, menus, SEO, 0073). Not: orders, customers, costs,
--                       profit, GST, settings, the team
--   frontend            "front-end UI": the shop's look only (banners, homepage
--                       sections, menus, theme, 0073)
--
-- How it's kept by the database, not just the screens:
-- 1. profiles.staff_role holds the role; profiles.role stays 'admin' for all
--    staff (so they're kept out of visit counts and listed on the team, as
--    before) and 'customer' for everyone else. Everyone who is an admin
--    today becomes an owner, so nobody loses anything.
-- 2. is_admin() (used by every admin function and rule since 0001) is now
--    true only for owner, admin and accounts. The storefront and front-end
--    roles get their own rules (staff_can) on the tables they work on.
-- 3. What accounts can't do is closed off where it happens: settings can't be
--    saved, products can't be deleted, all-data downloads and the team are
--    refused.
-- 4. Two-step sign-in (an authenticator app, Supabase Auth's TOTP): someone
--    who has set it up counts as staff only once they've passed it in this
--    sign-in (aal2). store_settings.staff_2fa makes it required for all staff.
-- 5. admin_set_staff(email, role) and admin_team() with roles; my_staff() for
--    the admin screens.
--
-- Re-run safe. Depends on 0001, 0042, 0046, 0049, 0050, 0063, 0065, 0070, 0071.

-- ---------------------------------------------------------------- 1. the role
alter table public.profiles add column if not exists staff_role text;
alter table public.profiles drop constraint if exists profiles_staff_role_check;
alter table public.profiles add constraint profiles_staff_role_check
  check (staff_role is null or staff_role in ('owner', 'admin', 'accounts', 'storefront', 'frontend'));
update public.profiles set staff_role = 'owner' where role = 'admin' and staff_role is null;
update public.profiles set staff_role = null where role <> 'admin' and staff_role is not null;

-- role and staff_role move together, and only through the team functions
create or replace function public.profiles_staff_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.staff_role is distinct from old.staff_role)
     and coalesce(current_setting('babajee.staff_change', true), '') <> '1'
     and (select auth.uid()) is not null then
    raise exception 'Roles are changed on the Team page.' using errcode = '42501';
  end if;
  if new.role = 'admin' and new.staff_role is null then
    new.staff_role := 'admin';
  elsif new.role <> 'admin' then
    new.staff_role := null;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_staff_guard on public.profiles;
create trigger profiles_staff_guard before update of role, staff_role on public.profiles
  for each row execute function public.profiles_staff_guard();

alter table public.store_settings add column if not exists staff_2fa boolean not null default false;

-- ---------------------------------------------------------------- 2. who counts as what
-- the caller's staff role, once any two-step sign-in they need is passed
create or replace function public.staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.staff_role
    from public.profiles p
   where p.id = (select auth.uid()) and p.role = 'admin'
     and (
       coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
       or (not exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')
           and not coalesce((select s.staff_2fa from public.store_settings s where s.id = 1), false))
     );
$$;
revoke all on function public.staff_role() from public;
grant execute on function public.staff_role() to anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.staff_role() in ('owner', 'admin', 'accounts'), false);
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- what each role may do, by area
create or replace function public.staff_can(p_area text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(case p_area
    when 'team' then public.staff_role() in ('owner', 'admin')
    when 'settings' then public.staff_role() in ('owner', 'admin')
    when 'export' then public.staff_role() in ('owner', 'admin')
    when 'delete' then public.staff_role() in ('owner', 'admin')
    when 'money' then public.staff_role() in ('owner', 'admin', 'accounts')
    when 'catalog' then public.staff_role() in ('owner', 'admin', 'accounts', 'storefront')
    when 'content' then public.staff_role() in ('owner', 'admin', 'storefront')
    when 'look' then public.staff_role() in ('owner', 'admin', 'storefront', 'frontend')
    else false
  end, false);
$$;
revoke all on function public.staff_can(text) from public;
grant execute on function public.staff_can(text) to anon, authenticated;

-- ---------------------------------------------------------------- the catalogue for storefront managers
do $$
declare
  t text;
begin
  foreach t in array array['products', 'product_variants', 'product_images', 'categories', 'collections', 'collection_items',
                           'subcategories', 'subcategory_groups', 'product_subcategories', 'product_reviews', 'bundle_items'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "catalog staff" on public.%I', t);
      execute format('create policy "catalog staff" on public.%I for all to authenticated using (public.staff_can(''catalog'')) with check (public.staff_can(''catalog''))', t);
    end if;
  end loop;
end $$;

drop policy if exists "catalog staff add product photos" on storage.objects;
create policy "catalog staff add product photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos' and public.staff_can('catalog'));
drop policy if exists "catalog staff change product photos" on storage.objects;
create policy "catalog staff change product photos" on storage.objects for update to authenticated
  using (bucket_id = 'product-photos' and public.staff_can('catalog')) with check (bucket_id = 'product-photos' and public.staff_can('catalog'));
drop policy if exists "catalog staff remove product photos" on storage.objects;
create policy "catalog staff remove product photos" on storage.objects for delete to authenticated
  using (bucket_id = 'product-photos' and public.staff_can('catalog'));

-- ---------------------------------------------------------------- 3. what accounts can't do
drop policy if exists "settings: owners and admins" on public.store_settings;
create policy "settings: owners and admins" on public.store_settings as restrictive for update to authenticated
  using (public.staff_can('settings')) with check (public.staff_can('settings'));

-- deleting a product: owners and admins (a sale's cleanup, run with no
-- signed-in user, is left alone)
create or replace function public.products_delete_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.staff_can('delete') then
    raise exception 'Only an owner or admin can delete a product. Archive it instead.' using errcode = '42501';
  end if;
  return old;
end;
$$;
drop trigger if exists products_delete_guard on public.products;
create trigger products_delete_guard before delete on public.products
  for each row execute function public.products_delete_guard();

-- all-data downloads: owners and admins (the 0049 functions, wrapped)
do $$
begin
  if to_regprocedure('public.admin_export_tables_0049()') is null then
    alter function public.admin_export_tables() rename to admin_export_tables_0049;
  end if;
  if to_regprocedure('public.admin_export_0049(text, integer, integer)') is null then
    alter function public.admin_export(text, integer, integer) rename to admin_export_0049;
  end if;
end $$;
revoke all on function public.admin_export_tables_0049() from public, anon, authenticated;
revoke all on function public.admin_export_0049(text, integer, integer) from public, anon, authenticated;

create or replace function public.admin_export_tables()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.staff_can('export') then
    raise exception 'Only an owner or admin can download all the data.' using errcode = '42501';
  end if;
  return public.admin_export_tables_0049();
end;
$$;
revoke all on function public.admin_export_tables() from public, anon;
grant execute on function public.admin_export_tables() to authenticated;

create or replace function public.admin_export(p_table text, p_offset integer, p_limit integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.staff_can('export') then
    raise exception 'Only an owner or admin can download all the data.' using errcode = '42501';
  end if;
  return public.admin_export_0049(p_table, p_offset, p_limit);
end;
$$;
revoke all on function public.admin_export(text, integer, integer) from public, anon;
grant execute on function public.admin_export(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------- 5. the team
create or replace function public.admin_team()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.staff_role() is null then
    raise exception 'Staff only.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'name', p.full_name, 'email', u.email, 'role', p.staff_role,
             'two_step', exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
             'last_sign_in', u.last_sign_in_at, 'joined', p.created_at, 'me', p.id = auth.uid())
           order by array_position(array['owner', 'admin', 'accounts', 'storefront', 'frontend'], p.staff_role), p.created_at)
      from public.profiles p join auth.users u on u.id = p.id
     where p.role = 'admin' and not p.hidden), '[]');
end;
$$;
revoke all on function public.admin_team() from public, anon;
grant execute on function public.admin_team() to authenticated;

-- give an existing account a staff role, change it, or take it away (null)
create or replace function public.admin_set_staff(p_email text, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me text := public.staff_role();
  who uuid;
  cur text;
begin
  if not public.staff_can('team') then
    raise exception 'Only an owner or admin can change the team.' using errcode = '42501';
  end if;
  if p_role is not null and p_role not in ('owner', 'admin', 'accounts', 'storefront', 'frontend') then
    raise exception 'Unknown role.' using errcode = '22023';
  end if;
  select u.id, p.staff_role into who, cur
    from auth.users u join public.profiles p on p.id = u.id
   where lower(u.email) = lower(btrim(coalesce(p_email, '')));
  if who is null then
    raise exception 'No account with that email. They need to sign up on the shop first.' using errcode = 'P0002';
  end if;
  if who = auth.uid() then
    raise exception 'You can''t change your own role. Ask an owner.' using errcode = '42501';
  end if;
  if me <> 'owner' and (cur in ('owner', 'admin') or p_role in ('owner', 'admin')) then
    raise exception 'Only an owner can add, change or remove owners and admins.' using errcode = '42501';
  end if;
  if cur = 'owner' and p_role is distinct from 'owner'
     and (select count(*) from public.profiles where staff_role = 'owner') <= 1 then
    raise exception 'The shop needs at least one owner.' using errcode = '22023';
  end if;
  perform set_config('babajee.staff_change', '1', true);
  update public.profiles
     set role = case when p_role is null then 'customer' else 'admin' end, staff_role = p_role
   where id = who;
  perform set_config('babajee.staff_change', '', true);
end;
$$;
revoke all on function public.admin_set_staff(text, text) from public, anon;
grant execute on function public.admin_set_staff(text, text) to authenticated;

-- the older on/off (0042): an owner's, giving the admin role
create or replace function public.admin_set_admin(p_email text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_set_staff(p_email, case when p_on then 'admin' else null end);
end;
$$;
revoke all on function public.admin_set_admin(text, boolean) from public, anon;
grant execute on function public.admin_set_admin(text, boolean) to authenticated;

-- for the admin screens: my role, and whether two-step sign-in is needed and done
create or replace function public.my_staff()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'role', p.staff_role,
    'enrolled', exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
    'required', coalesce((select s.staff_2fa from public.store_settings s where s.id = 1), false),
    'passed', coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2',
    'active', public.staff_role() is not null)
    from public.profiles p
   where p.id = (select auth.uid()) and p.role = 'admin';
$$;
revoke all on function public.my_staff() from public, anon;
grant execute on function public.my_staff() to authenticated;
