-- 1. Test accounts: profiles.is_test, shown as a "Test" tag in the admin
--    (like the Admin tag), so seeded customers are easy to spot and remove.
-- 2. admin_traffic(): the Analytics > Traffic tab. Visits grouped into
--    sessions, then by source, device, landing page, hour and category.
-- Depends on 0013 (site_events), 0014 (admin_customers). Safe to re-run.

-- ---------------------------------------------------------------- 1. test accounts

alter table public.profiles add column if not exists is_test boolean not null default false;
-- the seeded customer base (no password, can't sign in)
update public.profiles p set is_test = true
  from auth.users u where u.id = p.id and u.email like '%@seed.babajee.test' and not p.is_test;

drop function if exists public.admin_customers();

create or replace function public.admin_customers()
returns table (id uuid, full_name text, phone text, email text, role text, joined timestamptz,
               orders bigint, spent numeric, last_order timestamptz, is_test boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.phone, u.email::text, p.role, p.created_at,
           count(o.id), coalesce(sum(o.total) filter (where o.status not in ('cancelled', 'refunded')), 0),
           max(o.created_at), p.is_test
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.orders o on o.profile_id = p.id
     group by p.id, u.email
     order by max(o.created_at) desc nulls last, p.created_at desc;
end;
$$;

revoke all on function public.admin_customers() from public, anon;
grant execute on function public.admin_customers() to authenticated;

-- ---------------------------------------------------------------- 2. traffic

create or replace function public.admin_traffic(p_from date, p_to date)
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

  with ev as (
    select * from public.site_events where created_at >= t0 and created_at < t1
  ),
  -- one row per visit: where it came from, where it landed, how deep it went
  s as (
    select session_id,
           min(created_at) as t_start,
           extract(epoch from max(created_at) - min(created_at)) as secs,
           count(*) filter (where kind = 'view') as views,
           bool_or(kind = 'cart') as cart,
           bool_or(kind = 'checkout') as checkout,
           coalesce(nullif((array_agg(referrer order by created_at) filter (where kind = 'view'))[1], ''), 'Direct') as source,
           coalesce((array_agg(path order by created_at) filter (where kind = 'view'))[1], '') as landing,
           coalesce(nullif((array_agg(device order by created_at))[1], ''), 'unknown') as device
      from ev group by session_id
  ),
  s2 as (
    select s.*, (views <= 1 and not cart and not checkout) as bounced from s
  ),
  o as (
    select x.id, x.created_at from public.orders x
     where x.created_at >= t0 and x.created_at < t1 and x.status <> 'cancelled'
  ),
  days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  ),
  sold as (
    select c.slug, sum(i.quantity) as units, sum(i.quantity * i.unit_price) as sales
      from public.order_items i
      join o on o.id = i.order_id
      join public.product_variants v on v.id = i.variant_id
      join public.products p on p.id = v.product_id
      join public.categories c on c.id = p.category_id
     group by c.slug
  ),
  looked as (
    select substr(path, 7) as slug, count(*) as views, count(distinct session_id) as visitors
      from ev where kind = 'view' and path like '/shop/%' and path not like '/shop/%/%'
     group by 1
  )
  select jsonb_build_object(
    'sessions', (select count(*) from s2),
    'views', (select coalesce(sum(views), 0) from s2),
    'bounced', (select count(*) from s2 where bounced),
    'engaged_secs', (select coalesce(round(avg(secs)), 0) from s2 where not bounced),
    'cart_sessions', (select count(*) from s2 where cart),
    'checkout_sessions', (select count(*) from s2 where checkout),
    'orders', (select count(*) from o),
    'first_visit', (select min(created_at) from public.site_events),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', days.day, 'sessions', coalesce(x.n, 0), 'views', coalesce(x.v, 0)) order by days.day), '[]')
        from days left join (
          select (t_start at time zone 'Asia/Kolkata')::date as day, count(*) as n, sum(views) as v
            from s2 group by 1) x on x.day = days.day),
    'sources', (
      select coalesce(jsonb_agg(x order by x.sessions desc), '[]') from (
        select source as name, count(*) as sessions, sum(views) as views,
               count(*) filter (where bounced) as bounced,
               count(*) filter (where cart) as cart, count(*) filter (where checkout) as checkout
          from s2 group by source) x),
    'devices', (
      select coalesce(jsonb_agg(x order by x.sessions desc), '[]') from (
        select device as name, count(*) as sessions, sum(views) as views,
               count(*) filter (where bounced) as bounced,
               count(*) filter (where cart) as cart, count(*) filter (where checkout) as checkout
          from s2 group by device) x),
    'landing', (
      select coalesce(jsonb_agg(x order by x.sessions desc), '[]') from (
        select landing as name, count(*) as sessions,
               count(*) filter (where bounced) as bounced,
               count(*) filter (where checkout) as checkout
          from s2 where landing <> '' group by landing order by count(*) desc limit 8) x),
    'pages', (
      select coalesce(jsonb_agg(x order by x.views desc), '[]') from (
        select path as name, count(*) as views, count(distinct session_id) as visitors
          from ev where kind = 'view' group by path order by count(*) desc limit 10) x),
    -- Monday = 1 … Sunday = 7, hour 0-23, India time
    'hours', (
      select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hour, 'sessions', n)), '[]') from (
        select extract(isodow from t_start at time zone 'Asia/Kolkata')::int as dow,
               extract(hour from t_start at time zone 'Asia/Kolkata')::int as hour, count(*) as n
          from s2 group by 1, 2) x),
    'categories', (
      select coalesce(jsonb_agg(x order by x.views desc), '[]') from (
        select c.name, coalesce(l.views, 0) as views, coalesce(l.visitors, 0) as visitors,
               coalesce(sd.units, 0) as units, coalesce(sd.sales, 0) as sales
          from public.categories c
          left join looked l on l.slug = c.slug
          left join sold sd on sd.slug = c.slug
         where coalesce(l.views, 0) > 0 or coalesce(sd.units, 0) > 0) x)
  ) into r;
  return r;
end;
$$;

revoke all on function public.admin_traffic(date, date) from public, anon;
grant execute on function public.admin_traffic(date, date) to authenticated;
