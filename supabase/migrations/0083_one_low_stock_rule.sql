-- 0083: one low-stock rule everywhere. Home's counts, the low-stock alert
-- (admin_low_stock, 0061) and Inventory › Stock's Low and Out filters all
-- count a counted, shown, loose option of an active product: out at 0 or
-- less, low from 1 up to its product's mark (else the shop's). Before this,
-- Home's out-of-stock count also took in drafts and archived products.
create or replace function public.admin_home_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  shop_mark int := coalesce((select low_stock_at from public.store_settings where id = 1), 3);
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'requests', (select count(*) from public.order_requests where status = 'open'),
    'unpaid', (select count(*) from public.orders where status = 'pending'),
    'to_pack', (select count(*) from public.orders where status = 'paid'),
    'to_ship', (select count(*) from public.orders where status = 'packed'),
    'in_transit', (select count(*) from public.orders where status = 'shipped'),
    'out_of_stock', (select count(*) from public.product_variants v join public.products p on p.id = v.product_id
                      where v.track_stock and v.is_visible and v.unit_variant_id is null and p.status = 'published' and v.stock_qty <= 0),
    'low_stock', (select count(*) from public.product_variants v join public.products p on p.id = v.product_id
                   where v.track_stock and v.is_visible and v.unit_variant_id is null and p.status = 'published'
                     and v.stock_qty between 1 and coalesce(p.low_stock_at, shop_mark)),
    'unpriced', (select count(*) from public.product_variants where is_visible and price = 0)
  );
end;
$$;
