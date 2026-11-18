-- Two-step sign-in (0072) is taken out: a staff member counts as staff on
-- their role alone, whatever their sign-in.
--
-- 1. staff_role() no longer looks at the sign-in level (aal) or at any
--    authenticator app someone set up.
-- 2. my_staff() returns just the role and whether it's active; admin_team()
--    drops the two_step column.
-- 3. store_settings.staff_2fa goes.
--
-- Authenticator apps someone already set up stay in Supabase Auth
-- (auth.mfa_factors) but nothing asks for them. They can be removed in the
-- dashboard under Authentication > Users if wanted.
--
-- Re-run safe. Depends on 0072.

-- ---------------------------------------------------------------- 1. the role, on its own
create or replace function public.staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.staff_role
    from public.profiles p
   where p.id = (select auth.uid()) and p.role = 'admin';
$$;
revoke all on function public.staff_role() from public;
grant execute on function public.staff_role() to anon, authenticated;

-- ---------------------------------------------------------------- 2. the admin screens
create or replace function public.my_staff()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('role', p.staff_role, 'active', p.staff_role is not null)
    from public.profiles p
   where p.id = (select auth.uid()) and p.role = 'admin';
$$;
revoke all on function public.my_staff() from public, anon;
grant execute on function public.my_staff() to authenticated;

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
             'last_sign_in', u.last_sign_in_at, 'joined', p.created_at, 'me', p.id = auth.uid())
           order by array_position(array['owner', 'admin', 'accounts', 'storefront', 'frontend'], p.staff_role), p.created_at)
      from public.profiles p join auth.users u on u.id = p.id
     where p.role = 'admin' and not p.hidden), '[]');
end;
$$;
revoke all on function public.admin_team() from public, anon;
grant execute on function public.admin_team() to authenticated;

-- ---------------------------------------------------------------- 3. the setting
alter table public.store_settings drop column if exists staff_2fa;
