-- Bugfix: public.is_admin() was granted to 'authenticated' only (0001), but
-- 0003_catalogue.sql and 0005's store_settings policy call it for 'anon' too
-- (a signed-out visitor browsing the shop). Postgres does not guarantee
-- left-to-right short-circuiting of "is_visible or public.is_admin()" inside
-- a row-security policy, so the anon role can hit "permission denied for
-- function is_admin" even on a plain, fully-visible row.
--
-- Safe to grant to anon: is_admin() only ever returns true when auth.uid()
-- matches a profile with role = 'admin', and auth.uid() is null for a
-- signed-out visitor, so this never lets anon see anything extra.
grant execute on function public.is_admin() to anon;

-- Verify:
--   select grantee from information_schema.role_routine_grants
--     where routine_name = 'is_admin';  -- anon, authenticated
