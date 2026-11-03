-- Reports: the tables behind Analytics > Reports, each downloadable as CSV.
--
-- 1. store_settings.store_state: the state the shop is registered in. GST on
--    a sale inside that state splits into CGST + SGST; a sale to any other
--    state is IGST. Blank means "not set", and the GST report shows one total.
-- 2. admin_report(kind, from, to) returns a jsonb array of rows for one of:
--    'products'  sales, returns, profit per product option
--    'customers' orders and spend per customer (guests by email)
--    'stock'     stock on hand, sold, days of stock left, sell-through
--    'finance'   one row per month: sales, delivery, GST, cost, profit
--    'gst'       one row per month, place of supply and rate: taxable value
--                and the GST on it, split CGST/SGST/IGST
--    Dates are inclusive, India time, like admin_analytics. Cancelled orders
--    are always left out. Refunded orders count in gross and come off as
--    returns; profit, GST and stock sold leave them out.
--
-- Depends on 0013 and 0015. Safe to re-run.

alter table public.store_settings
  add column if not exists store_state text not null default '';

create or replace function public.admin_report(p_kind text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t0 timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  t1 timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
  ndays int := (p_to - p_from) + 1;
  credit boolean;
  home text;
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if p_to < p_from or ndays > 3700 then
    raise exception 'Pick a start date on or before the end date.' using errcode = '22023';
  end if;
  select coalesce(st.gst_input_credit, false), coalesce(st.store_state, '')
    into credit, home
    from public.store_settings st where st.id = 1;
  credit := coalesce(credit, false);
  home := coalesce(home, '');

  if p_kind = 'products' then
    with o as (
      select * from public.orders where created_at >= t0 and created_at < t1 and status <> 'cancelled'
    ),
    l as (
      select i.product_name, i.variant_label, i.quantity as q, i.unit_price as price,
             o.status = 'refunded' as refunded,
             case when o.gst_inclusive then i.unit_price * 100 / (100 + o.gst_rate) else i.unit_price end as net,
             case when coalesce(c.unit_cost, vc.cost) is null then null
                  when credit then coalesce(c.unit_cost, vc.cost) * 100 / (100 + o.gst_rate)
                  else coalesce(c.unit_cost, vc.cost) end as cost_ex
        from o
        join public.order_items i on i.order_id = o.id
        left join public.order_item_costs c on c.order_item_id = i.id
        left join public.variant_costs vc on vc.variant_id = i.variant_id
    )
    select coalesce(jsonb_agg(x order by x.gross desc, x.product), '[]') into r from (
      select product_name as product,
             variant_label as option,
             coalesce(sum(q) filter (where not refunded), 0) as sold,
             sum(q * price) as gross,
             coalesce(sum(q * price) filter (where refunded), 0) as returns,
             sum(q * price) - coalesce(sum(q * price) filter (where refunded), 0) as net,
             round(coalesce(sum(q * net) filter (where not refunded), 0), 2) as sales_ex_gst,
             case when bool_and(cost_ex is not null) filter (where not refunded)
                  then round(coalesce(sum(q * cost_ex) filter (where not refunded), 0), 2) end as cost,
             case when bool_and(cost_ex is not null) filter (where not refunded)
                  then round(coalesce(sum(q * (net - cost_ex)) filter (where not refunded), 0), 2) end as profit
        from l
       group by product_name, variant_label
    ) x;

  elsif p_kind = 'customers' then
    with o as (
      select o.*, (select coalesce(sum(i.quantity), 0) from public.order_items i where i.order_id = o.id) as items
        from public.orders o
       where o.created_at >= t0 and o.created_at < t1 and o.status <> 'cancelled'
    )
    select coalesce(jsonb_agg(x order by x.net desc, x.name), '[]') into r from (
      select (array_agg(contact_name order by created_at desc))[1] as name,
             (array_agg(contact_email order by created_at desc))[1] as email,
             (array_agg(contact_phone order by created_at desc))[1] as phone,
             bool_and(profile_id is null) as guest,
             count(*) as orders,
             sum(items) filter (where status <> 'refunded') as items,
             sum(subtotal) as gross,
             coalesce(sum(subtotal) filter (where status = 'refunded'), 0) as returns,
             sum(subtotal) - coalesce(sum(subtotal) filter (where status = 'refunded'), 0) as net,
             round(sum(subtotal) / count(*), 2) as average,
             min(created_at at time zone 'Asia/Kolkata')::date as first_order,
             max(created_at at time zone 'Asia/Kolkata')::date as last_order
        from o
       group by coalesce(profile_id::text, lower(contact_email))
    ) x;

  elsif p_kind = 'stock' then
    with sold as (
      select i.variant_id, sum(i.quantity) as q
        from public.orders o join public.order_items i on i.order_id = o.id
       where o.created_at >= t0 and o.created_at < t1 and o.status not in ('cancelled', 'refunded')
       group by i.variant_id
    )
    select coalesce(jsonb_agg(x order by x.days_left asc nulls last, x.sold desc, x.product, x.option), '[]') into r from (
      select p.name as product, v.label as option, v.sku, v.track_stock as tracked,
             case when v.track_stock then v.stock_qty end as in_stock,
             coalesce(s.q, 0) as sold,
             round(coalesce(s.q, 0)::numeric / ndays, 2) as per_day,
             case when v.track_stock and coalesce(s.q, 0) > 0
                  then floor(v.stock_qty / (s.q::numeric / ndays)) end as days_left,
             case when v.track_stock and coalesce(s.q, 0) + v.stock_qty > 0
                  then round(coalesce(s.q, 0) * 100.0 / (coalesce(s.q, 0) + v.stock_qty), 1) end as sell_through
        from public.product_variants v
        join public.products p on p.id = v.product_id
        left join sold s on s.variant_id = v.id
    ) x;

  elsif p_kind = 'finance' then
    with o as (
      select o.*, date_trunc('month', o.created_at at time zone 'Asia/Kolkata')::date as month
        from public.orders o
       where o.created_at >= t0 and o.created_at < t1 and o.status <> 'cancelled'
    ),
    c as (
      select date_trunc('month', o.created_at at time zone 'Asia/Kolkata')::date as month,
             sum(i.quantity * case when credit then coalesce(oc.unit_cost, vc.cost) * 100 / (100 + o.gst_rate)
                                   else coalesce(oc.unit_cost, vc.cost) end) as cost,
             sum(i.quantity * case when credit then coalesce(oc.unit_cost, vc.cost) - coalesce(oc.unit_cost, vc.cost) * 100 / (100 + o.gst_rate)
                                   else 0 end) as gst_paid,
             sum(i.quantity * case when o.gst_inclusive then i.unit_price * 100 / (100 + o.gst_rate) else i.unit_price end)
               filter (where coalesce(oc.unit_cost, vc.cost) is not null) as costed_sales,
             count(*) filter (where coalesce(oc.unit_cost, vc.cost) is null) as uncosted
        from public.orders o
        join public.order_items i on i.order_id = o.id
        left join public.order_item_costs oc on oc.order_item_id = i.id
        left join public.variant_costs vc on vc.variant_id = i.variant_id
       where o.created_at >= t0 and o.created_at < t1 and o.status not in ('cancelled', 'refunded')
       group by 1
    )
    select coalesce(jsonb_agg(x order by x.month), '[]') into r from (
      select m.month,
             count(*) filter (where m.status <> 'refunded') as orders,
             sum(m.subtotal) as gross,
             coalesce(sum(m.subtotal) filter (where m.status = 'refunded'), 0) as returns,
             sum(m.subtotal) - coalesce(sum(m.subtotal) filter (where m.status = 'refunded'), 0) as net,
             coalesce(sum(m.shipping) filter (where m.status <> 'refunded'), 0) as delivery,
             coalesce(sum(m.tax) filter (where m.status <> 'refunded'), 0) as gst,
             coalesce(sum(m.total) filter (where m.status <> 'refunded'), 0) as collected,
             case when max(c.costed_sales) is not null then round(max(c.cost), 2) end as cost,
             case when max(c.costed_sales) is not null then round(max(c.costed_sales) - max(c.cost), 2) end as profit,
             greatest(round(coalesce(sum(m.tax) filter (where m.status <> 'refunded'), 0) - coalesce(max(c.gst_paid), 0), 2), 0) as gst_to_pay,
             coalesce(max(c.uncosted), 0) as uncosted_lines
        from o m left join c on c.month = m.month
       group by m.month
    ) x;

  elsif p_kind = 'gst' then
    select coalesce(jsonb_agg(x order by x.month, x.place, x.rate), '[]') into r from (
      select date_trunc('month', created_at at time zone 'Asia/Kolkata')::date as month,
             address_state as place,
             gst_rate as rate,
             count(*) as orders,
             sum(case when gst_inclusive then subtotal - tax else subtotal end) as taxable,
             case when home = '' then null when address_state = home then 0 else sum(tax) end as igst,
             case when home = '' then null when address_state = home then round(sum(tax) / 2, 2) else 0 end as cgst,
             case when home = '' then null when address_state = home then sum(tax) - round(sum(tax) / 2, 2) else 0 end as sgst,
             sum(tax) as gst
        from public.orders
       where created_at >= t0 and created_at < t1 and status not in ('cancelled', 'refunded')
       group by 1, 2, 3
    ) x;

  else
    raise exception 'Unknown report %.', p_kind using errcode = '22023';
  end if;

  return r;
end;
$$;

revoke all on function public.admin_report(text, date, date) from public, anon;
grant execute on function public.admin_report(text, date, date) to authenticated;
