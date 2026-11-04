-- Deleting a product from the admin.
--
-- order_items.variant_id is "on delete set null", so a plain delete of an
-- ordered product would quietly cut it out of its orders: the line keeps its
-- name and price, but its cost (variant_costs cascades) and its place in the
-- product and stock reports go with it. And cart_items is "restrict", so a
-- product sitting in anyone's cart couldn't be deleted at all.
--
-- So deletes go through here: a product that has ever been ordered is
-- refused (hide it instead), and an unordered one leaves carts first.

create or replace function public.admin_delete_product(p_product uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.order_items oi
    join public.product_variants v on v.id = oi.variant_id
    where v.product_id = p_product
  ) then
    raise exception 'product_ordered' using errcode = 'P0001', hint = 'This product has been ordered. Hide it instead.';
  end if;
  delete from public.cart_items ci using public.product_variants v
  where ci.variant_id = v.id and v.product_id = p_product;
  delete from public.products where id = p_product;
end;
$$;

revoke all on function public.admin_delete_product(uuid) from public, anon;
grant execute on function public.admin_delete_product(uuid) to authenticated;
