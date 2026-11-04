-- Analytics: where customers are. Orders in a date range grouped by the
-- delivery city, with the map pin's average position when customers dropped
-- one (the page places the rest from a city list). Cancelled orders are left
-- out, like the rest of analytics. Safe to re-run.

create or replace function public.admin_geo(p_from date, p_to date)
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

  with o as (
    select x.*, coalesce(rt.subtotal, 0) as r_sub
      from public.orders x left join public.order_refund_totals rt on rt.order_id = x.id
     where x.created_at >= t0 and x.created_at < t1 and x.status <> 'cancelled'
  ),
  c as (
    select initcap(lower(trim(address_city))) as city, trim(address_state) as state,
           count(distinct coalesce(profile_id::text, contact_email)) as customers,
           count(*) as orders,
           sum(subtotal - r_sub) as sales,
           avg(address_latitude) as lat, avg(address_longitude) as lng
      from o group by 1, 2
  )
  select jsonb_build_object(
    'cities', (select coalesce(jsonb_agg(c order by c.sales desc), '[]') from c),
    'customers', (select count(distinct coalesce(profile_id::text, contact_email)) from o)
  ) into r;
  return r;
end;
$$;

revoke all on function public.admin_geo(date, date) from public, anon;
grant execute on function public.admin_geo(date, date) to authenticated;
