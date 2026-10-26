-- 0002 revoked everything from anon but left Supabase's default grants for
-- signed-in users, which include TRUNCATE (ignores row-level security),
-- REFERENCES and TRIGGER. Customers only need to read and write their own rows.

revoke all on public.addresses from authenticated;
grant select, insert, update, delete on public.addresses to authenticated;

-- Verify:
--   select privilege_type from information_schema.role_table_grants
--   where table_name = 'addresses' and grantee = 'authenticated' order by 1;  -- DELETE, INSERT, SELECT, UPDATE
