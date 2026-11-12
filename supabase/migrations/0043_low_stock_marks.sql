-- Low-stock alerts, in the admin.
--
-- 1. store_settings.low_stock_at: the shop's low mark (default 3).
--    products.low_stock_at: a product's own mark, or null for the shop's.
--    An option of a product is low when it counts stock, is on sale, and has
--    1 to its mark left (0 is out of stock, counted on its own).
-- 2. admin_low_stock(): every low option (and every out-of-stock one), with
--    its product, stock and mark: the admin's alerts read this.
-- 3. admin_home_counts() counts low stock against those marks.
-- Depends on 0013, 0022 (admin_home_counts), 0041 (product status).
-- Safe to re-run.

alter table public.store_settings add column if not exists low_stock_at int not null default 3;
alter table public.store_settings drop constraint if exists store_settings_low_stock_at_check;
alter table public.store_settings add constraint store_settings_low_stock_at_check check (low_stock_at between 0 and 10000);

alter table public.products add column if not exists low_stock_at int;
alter table public.products drop constraint if exists products_low_stock_at_check;
alter table public.products add constraint products_low_stock_at_check check (low_stock_at is null or low_stock_at between 0 and 10000);

create or replace function public.admin_low_stock()
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
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'variant_id', v.id, 'product_id', p.id, 'product', p.name, 'option', v.label,
             'stock', v.stock_qty, 'mark', coalesce(p.low_stock_at, shop_mark), 'out', v.stock_qty <= 0)
           order by v.stock_qty, p.name)
      from public.product_variants v join public.products p on p.id = v.product_id
     where v.track_stock and v.is_visible and p.status = 'published'
       and v.stock_qty <= coalesce(p.low_stock_at, shop_mark)), '[]');
end;
$$;

revoke all on function public.admin_low_stock() from public, anon;
grant execute on function public.admin_low_stock() to authenticated;

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
    'out_of_stock', (select count(*) from public.product_variants where track_stock and is_visible and stock_qty = 0),
    'low_stock', (select count(*) from public.product_variants v join public.products p on p.id = v.product_id
                   where v.track_stock and v.is_visible and v.stock_qty between 1 and coalesce(p.low_stock_at, shop_mark)),
    'unpriced', (select count(*) from public.product_variants where is_visible and price = 0)
  );
end;
$$;
