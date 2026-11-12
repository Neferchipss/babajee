-- Supabase grants every new table's full set of privileges to signed-in
-- users by default. 0033 and 0037 took them back from signed-out visitors
-- only; the row rules still decided what anyone could read or change, but
-- TRUNCATE is not covered by row rules. Each table now grants exactly what
-- the shop uses (as 0010 did for addresses):
--   saved_products:  a customer reads, adds and removes their own
--   product_reviews: read; reviews are written only through submit_review;
--                    a customer may delete their own; admins update (publish,
--                    hide) under their row rule
-- Safe to re-run.

revoke all on public.saved_products from authenticated;
grant select, insert, update, delete on public.saved_products to authenticated;

revoke all on public.product_reviews from authenticated;
grant select, update, delete on public.product_reviews to authenticated;

-- the same for three older tables that kept the default (or "all"):
--   carts, cart_items: a customer reads and writes their own cart (0004, 0034)
--   shipments: admins write them under their row rule (0004); customers read
revoke all on public.carts, public.cart_items from authenticated;
grant select, insert, update, delete on public.carts, public.cart_items to authenticated;

revoke all on public.shipments from authenticated;
grant select, insert, update, delete on public.shipments to authenticated;

-- check: nothing in public can be emptied by a visitor or a signed-in user
--   select table_name from information_schema.role_table_grants
--   where table_schema = 'public' and grantee in ('anon', 'authenticated')
--     and privilege_type = 'TRUNCATE';   -- no rows
