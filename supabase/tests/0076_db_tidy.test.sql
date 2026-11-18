-- Tests for migration 0076 (indexes, unused functions dropped). Rolled back. Empty: passed.
do $$
declare
  want text[] := array['order_items_variant_idx', 'stock_movements_order_idx', 'cart_items_variant_idx', 'product_images_variant_idx',
                       'customer_notes_order_idx', 'support_messages_profile_idx', 'subcategories_group_idx'];
  n text;
begin
  foreach n in array want loop
    if to_regclass('public.' || n) is null then raise exception 'FAIL: index % missing', n; end if;
  end loop;
  if to_regprocedure('public.subcategories_from_labels()') is not null then raise exception 'FAIL: subcategories_from_labels still there'; end if;
  if to_regprocedure('public.admin_set_admin(text, boolean)') is not null then raise exception 'FAIL: admin_set_admin still there'; end if;
  -- the replacement stays
  if to_regprocedure('public.admin_set_staff(text, text)') is null then raise exception 'FAIL: admin_set_staff gone'; end if;
end $$;
