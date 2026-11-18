-- A light tidy (cleanup phase 5). Nothing here changes what anyone sees or
-- may do.
--
-- 1. Indexes for the links the shop looks things up by. Without them, finding
--    an order's stock moves or notes, a variant's photos, order lines or cart
--    lines, a customer's messages, or a group's sub-categories reads the whole
--    table. Small now; it grows with every order. Links that only record which
--    staff member did something (actor_id, author_id, recorded_by, ...) are
--    left without: they are only searched if a staff account is deleted.
create index if not exists order_items_variant_idx on public.order_items (variant_id);
create index if not exists stock_movements_order_idx on public.stock_movements (order_id);
create index if not exists cart_items_variant_idx on public.cart_items (variant_id);
create index if not exists product_images_variant_idx on public.product_images (variant_id);
create index if not exists customer_notes_order_idx on public.customer_notes (order_id);
create index if not exists support_messages_profile_idx on public.support_messages (profile_id);
create index if not exists subcategories_group_idx on public.subcategories (group_id);

-- 2. Functions nothing calls any more.
--    subcategories_from_labels: the one-time move to sub-categories (0063),
--    already run, and no one may call it.
--    admin_set_admin: the old "make admin" switch, replaced by admin_set_staff
--    (0072), which it only passed through to; no screen calls it.
drop function if exists public.subcategories_from_labels();
drop function if exists public.admin_set_admin(text, boolean);
