-- More reports for Analytics → Reports (each sortable and downloadable as
-- CSV, like the others): what people look at against what they buy, the
-- pages visits end on, the products that sell least, returns and why, new
-- customers over time, marketing campaigns, and refunds.
--
-- 1. order_requests.reason_code: a return request carries the reason the
--    customer picked (damaged, wrong item, not as described, quality, changed
--    mind, other) beside their words. customer_request_return(order, items,
--    reason, reason_code) sets it; the 3-argument one (0022) still works.
-- 2. admin_insights(kind, from, to) -> jsonb rows, kinds:
--    product_funnel  per product: views, add to cart, units bought, orders,
--                    view-to-cart and view-to-buy rates
--    exit_pages      per page: views, visits that ended there, exit rate
--    worst_sellers   every shown product, fewest units sold first, with views
--                    and stock (sitting stock is where money is stuck)
--    returns         per product: units delivered, units returned, rate, and
--                    the reasons picked
--    return_reasons  per reason: requests, accepted, units
--    new_customers   per week: new accounts, and how many of them ordered
--    marketing       per campaign (utm tags): visits, carts, orders, sales
--    refunds         every refund: order, customer, amount, GST, reason
--
-- Test accounts, hidden (staff) accounts and test orders are left out, as in
-- the other reports. Dates are in India time. Re-run safe. Depends on 0013,
-- 0017, 0022, 0036, 0046, 0048, 0049.

alter table public.order_requests add column if not exists reason_code text not null default '';
alter table public.order_requests drop constraint if exists order_requests_reason_code_check;
alter table public.order_requests add constraint order_requests_reason_code_check
  check (reason_code in ('', 'damaged', 'wrong_item', 'not_as_described', 'quality', 'changed_mind', 'other'));

create or replace function public.customer_request_return(p_order uuid, p_items jsonb, p_reason text, p_reason_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(p_reason_code, '') not in ('', 'damaged', 'wrong_item', 'not_as_described', 'quality', 'changed_mind', 'other') then
    raise exception 'Pick a reason for the return.' using errcode = '22023';
  end if;
  perform public.customer_request_return(p_order, p_items, p_reason);
  update public.order_requests set reason_code = coalesce(p_reason_code, '')
   where order_id = p_order and kind = 'return' and status = 'open';
end;
$$;
revoke all on function public.customer_request_return(uuid, jsonb, text, text) from public, anon;
grant execute on function public.customer_request_return(uuid, jsonb, text, text) to authenticated;

-- a product's slug from a tracked path: "/shop/bong/?p=slug" or "/shop/bong/slug/"
create or replace function public.slug_from_path(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p ~ '[?&]p=' then substring(p from '[?&]p=([^&#]+)')
    else nullif(regexp_replace(split_part(split_part(p, '?', 1), '#', 1), '^.*/([^/]+)/?$', '\1'), '')
  end;
$$;

create or replace function public.admin_insights(p_kind text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t0 timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  t1 timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if p_to < p_from or (p_to - p_from) > 3700 then
    raise exception 'Pick a start date on or before the end date.' using errcode = '22023';
  end if;

  if p_kind = 'product_funnel' then
    with ev as (
      select public.slug_from_path(e.path) as slug, e.kind, e.session_id
        from public.site_events e
       where e.created_at >= t0 and e.created_at < t1 and e.kind in ('product', 'add')
    ), seen as (
      select slug, count(*) filter (where kind = 'product') as views,
             count(distinct session_id) filter (where kind = 'product') as visits,
             count(*) filter (where kind = 'add') as adds
        from ev where slug is not null group by slug
    ), sold as (
      select p.slug, sum(i.quantity) as units, count(distinct o.id) as orders, sum(i.quantity * i.unit_price) as sales
        from public.orders o
        join public.order_items i on i.order_id = o.id
        join public.product_variants v on v.id = i.variant_id
        join public.products p on p.id = v.product_id
       where o.created_at >= t0 and o.created_at < t1 and o.status not in ('cancelled', 'pending') and not o.is_test
       group by p.slug
    )
    select coalesce(jsonb_agg(to_jsonb(x) order by x.views desc nulls last, x.units desc nulls last), '[]') into r from (
      select p.id as product_id, p.name as product, c.name as category,
             coalesce(s.views, 0) as views, coalesce(s.visits, 0) as visits, coalesce(s.adds, 0) as adds,
             coalesce(b.units, 0) as units, coalesce(b.orders, 0) as orders, coalesce(b.sales, 0) as sales,
             case when coalesce(s.views, 0) > 0 then round(100.0 * coalesce(s.adds, 0) / s.views, 1) end as cart_rate,
             case when coalesce(s.views, 0) > 0 then round(100.0 * coalesce(b.orders, 0) / s.views, 1) end as buy_rate
        from public.products p
        join public.categories c on c.id = p.category_id
        left join seen s on s.slug = p.slug
        left join sold b on b.slug = p.slug
       where coalesce(s.views, 0) + coalesce(s.adds, 0) + coalesce(b.units, 0) > 0
    ) x;

  elsif p_kind = 'exit_pages' then
    with ev as (
      select e.session_id, split_part(split_part(e.path, '?', 1), '#', 1) as page, e.created_at,
             row_number() over (partition by e.session_id order by e.created_at desc, e.id desc) as rn_last,
             row_number() over (partition by e.session_id order by e.created_at, e.id) as rn_first
        from public.site_events e
       where e.created_at >= t0 and e.created_at < t1 and e.kind in ('view', 'cart', 'checkout')
    ), ord as (
      select distinct session_id from public.orders where session_id is not null and created_at >= t0 and created_at < t1 and not is_test
    )
    select coalesce(jsonb_agg(to_jsonb(x) order by x.exits desc, x.views desc), '[]') into r from (
      select ev.page, count(*) as views,
             count(*) filter (where rn_first = 1) as entries,
             count(*) filter (where rn_last = 1 and ord.session_id is null) as exits,
             round(100.0 * count(*) filter (where rn_last = 1 and ord.session_id is null) / count(*), 1) as exit_rate
        from ev left join ord on ord.session_id = ev.session_id
       group by ev.page
      having count(*) >= 1
    ) x;

  elsif p_kind = 'worst_sellers' then
    with sold as (
      select v.product_id, sum(i.quantity) as units, sum(i.quantity * i.unit_price) as sales, max(o.created_at) as last_sold
        from public.orders o
        join public.order_items i on i.order_id = o.id
        join public.product_variants v on v.id = i.variant_id
       where o.created_at >= t0 and o.created_at < t1 and o.status not in ('cancelled', 'pending') and not o.is_test
       group by v.product_id
    ), ever as (
      select v.product_id, max(o.created_at) as last_sold
        from public.orders o join public.order_items i on i.order_id = o.id join public.product_variants v on v.id = i.variant_id
       where o.status not in ('cancelled', 'pending') and not o.is_test
       group by v.product_id
    ), views as (
      select public.slug_from_path(e.path) as slug, count(*) as views
        from public.site_events e where e.created_at >= t0 and e.created_at < t1 and e.kind = 'product' group by 1
    ), stock as (
      select v.product_id, sum(v.stock_qty) filter (where v.track_stock) as in_stock, min(v.price) as price
        from public.product_variants v where v.unit_variant_id is null and v.is_visible group by v.product_id
    )
    select coalesce(jsonb_agg(to_jsonb(x) order by x.units, x.views, x.in_stock desc nulls last), '[]') into r from (
      select p.id as product_id, p.name as product, c.name as category,
             coalesce(s.units, 0) as units, coalesce(s.sales, 0) as sales, coalesce(w.views, 0) as views,
             st.in_stock, st.price, (st.in_stock * st.price) as stock_value,
             ev.last_sold, (p.created_at at time zone 'Asia/Kolkata')::date as listed
        from public.products p
        join public.categories c on c.id = p.category_id
        left join sold s on s.product_id = p.id
        left join ever ev on ev.product_id = p.id
        left join views w on w.slug = p.slug
        left join stock st on st.product_id = p.id
       where p.is_visible and coalesce(p.status, 'published') = 'published' and p.created_at < t1
    ) x;

  elsif p_kind = 'returns' then
    with del as (
      select v.product_id, sum(i.quantity) as units
        from public.orders o join public.order_items i on i.order_id = o.id join public.product_variants v on v.id = i.variant_id
       where o.created_at >= t0 and o.created_at < t1 and o.status in ('delivered', 'refunded') and not o.is_test
       group by v.product_id
    ), ret as (
      select v.product_id, sum((it ->> 'qty')::int) as units, count(distinct q.id) as requests,
             count(distinct q.id) filter (where q.status = 'accepted') as accepted,
             string_agg(distinct nullif(q.reason_code, ''), ', ') as reasons
        from public.order_requests q
        join public.orders o on o.id = q.order_id and not o.is_test
        cross join lateral jsonb_array_elements(q.items) it
        join public.order_items i on i.id = (it ->> 'item')::uuid
        join public.product_variants v on v.id = i.variant_id
       where q.kind = 'return' and q.status <> 'withdrawn' and o.created_at >= t0 and o.created_at < t1
       group by v.product_id
    )
    select coalesce(jsonb_agg(to_jsonb(x) order by x.returned desc, x.delivered desc), '[]') into r from (
      select p.id as product_id, p.name as product, coalesce(d.units, 0) as delivered, coalesce(rt.units, 0) as returned,
             case when coalesce(d.units, 0) > 0 then round(100.0 * coalesce(rt.units, 0) / d.units, 1) end as return_rate,
             coalesce(rt.requests, 0) as requests, coalesce(rt.accepted, 0) as accepted, coalesce(rt.reasons, '') as reasons
        from public.products p
        left join del d on d.product_id = p.id
        left join ret rt on rt.product_id = p.id
       where d.units is not null or rt.units is not null
    ) x;

  elsif p_kind = 'return_reasons' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.requests desc), '[]') into r from (
      select coalesce(nullif(q.reason_code, ''), 'not_given') as reason,
             count(*) as requests, count(*) filter (where q.status = 'accepted') as accepted,
             count(*) filter (where q.status = 'declined') as declined,
             coalesce(sum((select sum((it ->> 'qty')::int) from jsonb_array_elements(q.items) it)), 0) as units
        from public.order_requests q join public.orders o on o.id = q.order_id and not o.is_test
       where q.kind = 'return' and q.status <> 'withdrawn' and q.created_at >= t0 and q.created_at < t1
       group by 1
    ) x;

  elsif p_kind = 'new_customers' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.week), '[]') into r from (
      select date_trunc('week', p.created_at at time zone 'Asia/Kolkata')::date as week,
             count(*) as new_customers,
             count(*) filter (where exists (select 1 from public.orders o where o.profile_id = p.id and o.status not in ('cancelled', 'pending') and not o.is_test)) as ordered,
             round(100.0 * count(*) filter (where exists (select 1 from public.orders o where o.profile_id = p.id and o.status not in ('cancelled', 'pending') and not o.is_test)) / count(*), 1) as ordered_rate
        from public.profiles p
       where p.role = 'customer' and not coalesce(p.is_test, false) and not p.hidden and p.created_at >= t0 and p.created_at < t1
       group by 1
    ) x;

  elsif p_kind = 'marketing' then
    with v as (
      select e.session_id,
             coalesce(nullif((array_agg(e.campaign order by e.created_at) filter (where e.campaign <> ''))[1], ''), '(none)') as campaign,
             bool_or(e.kind in ('add', 'cart')) as carted
        from public.site_events e
       where e.created_at >= t0 and e.created_at < t1
       group by e.session_id
    ), o as (
      select session_id, count(*) as orders, sum(total) as sales from public.orders
       where session_id is not null and created_at >= t0 and created_at < t1 and status not in ('cancelled', 'pending') and not is_test
       group by session_id
    )
    select coalesce(jsonb_agg(to_jsonb(x) order by x.visits desc), '[]') into r from (
      select split_part(v.campaign, '/', 1) as source, split_part(v.campaign, '/', 2) as medium, split_part(v.campaign, '/', 3) as campaign,
             count(*) as visits, count(*) filter (where v.carted) as carts,
             coalesce(sum(o.orders), 0) as orders, coalesce(sum(o.sales), 0) as sales,
             round(100.0 * count(o.session_id) / count(*), 1) as conversion
        from v left join o on o.session_id = v.session_id
       group by v.campaign
    ) x;

  elsif p_kind = 'refunds' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.refunded_at desc), '[]') into r from (
      select o.id as order_id, o.order_number as "order", o.contact_name as customer, o.contact_email as email,
             (f.created_at at time zone 'Asia/Kolkata')::date as refunded_at,
             f.amount, f.subtotal, f.shipping, f.tax as gst, f.returned, f.restocked, f.reason,
             coalesce((select string_agg(i.quantity || ' × ' || oi.product_name, '; ') from public.order_refund_items i join public.order_items oi on oi.id = i.order_item_id where i.refund_id = f.id), '') as items
        from public.order_refunds f join public.orders o on o.id = f.order_id
       where f.created_at >= t0 and f.created_at < t1 and not o.is_test
    ) x;

  else
    raise exception 'Unknown report.' using errcode = '22023';
  end if;
  return r;
end;
$$;
revoke all on function public.admin_insights(text, date, date) from public, anon;
grant execute on function public.admin_insights(text, date, date) to authenticated;
