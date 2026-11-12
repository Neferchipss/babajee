-- Analytics: sales by category for a date range, counted the way "Top
-- products" is (admin_analytics, 0017): orders in the range that were not
-- cancelled, item quantity less what was refunded, at the price paid. An
-- item whose product has since been deleted counts under "Other".
-- Depends on 0003, 0004, 0017 (order_item_refunded). Safe to re-run.

create or replace function public.admin_sales_by_category(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t0 timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  t1 timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(x order by x.sales desc), '[]') into r from (
    select coalesce(c.name, 'Other') as name,
           coalesce(c.slug, '') as slug,
           sum(i.quantity - coalesce(ir.qty, 0)) as qty,
           sum((i.quantity - coalesce(ir.qty, 0)) * i.unit_price) as sales
      from public.order_items i
      join public.orders o on o.id = i.order_id
       and o.created_at >= t0 and o.created_at < t1 and o.status <> 'cancelled'
      left join public.order_item_refunded ir on ir.order_item_id = i.id
      left join public.product_variants v on v.id = i.variant_id
      left join public.products p on p.id = v.product_id
      left join public.categories c on c.id = p.category_id
     group by c.name, c.slug
    having sum(i.quantity - coalesce(ir.qty, 0)) > 0
  ) x;
  return r;
end;
$$;

revoke all on function public.admin_sales_by_category(date, date) from public, anon;
grant execute on function public.admin_sales_by_category(date, date) to authenticated;
