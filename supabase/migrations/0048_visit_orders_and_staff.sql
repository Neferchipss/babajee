-- Better traffic numbers, for the person reading them.
--
-- 1. Orders tied to the visit they came from. orders.session_id is the
--    visit id from src/lib/track.ts; checkout attaches it right after
--    place_order (link_order_session). Only the order's own customer can set
--    it, and only once. admin_traffic() now counts real orders and sales per
--    source, device and first page, not just "reached checkout".
-- 2. Staff are never counted. track_event() keeps nothing for an admin
--    (role = 'admin', so the whole team), the way 0046 does for hidden
--    accounts, and their past rows are deleted here. The browser also
--    remembers a device that an admin has signed in on and stops sending
--    from it, even signed out (src/lib/track.ts).
--
-- Depends on 0013, 0024, 0036, 0046. Safe to re-run.
--
-- Check (read-only) afterwards:
--   select count(*) from public.site_events e join public.profiles p on p.id = e.profile_id
--    where p.role = 'admin';                                                    -- 0
--   select count(*) filter (where session_id is not null), count(*) from public.orders
--    where created_at > now() - interval '1 day';                              -- grows from here

-- ---------------------------------------------------------------- 1. orders <- visits

alter table public.orders add column if not exists session_id text;
create index if not exists orders_session_idx on public.orders (session_id) where session_id is not null;

create or replace function public.link_order_session(p_order uuid, p_session text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(coalesce(p_session, '')) not between 8 and 64 then
    return;
  end if;
  update public.orders
     set session_id = left(p_session, 64)
   where id = p_order and profile_id = (select auth.uid()) and session_id is null;
end;
$$;

revoke all on function public.link_order_session(uuid, text) from public, anon;
grant execute on function public.link_order_session(uuid, text) to authenticated;

-- ---------------------------------------------------------------- 2. staff not counted

-- what was recorded before: every visit an admin was signed in for
delete from public.site_events e
 where e.session_id in (
   select distinct x.session_id from public.site_events x
     join public.profiles p on p.id = x.profile_id
    where p.role = 'admin' or p.hidden);

create or replace function public.track_event(p_session text, p_kind text, p_path text, p_referrer text, p_device text, p_label text default ''::text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if p_kind not in ('view', 'cart', 'checkout', 'product', 'add') or length(coalesce(p_session, '')) not between 8 and 64 then
    return;
  end if;
  -- a hidden account or staff: nothing kept, not even this visit's rows from before it signed in
  if me is not null and exists (select 1 from public.profiles where id = me and (hidden or role = 'admin')) then
    delete from public.site_events where session_id = left(p_session, 64) and profile_id is null;
    return;
  end if;
  insert into public.site_events (session_id, kind, path, referrer, device, label, profile_id)
  values (
    left(p_session, 64), p_kind, left(coalesce(p_path, ''), 200), left(coalesce(p_referrer, ''), 120),
    case when p_device in ('mobile', 'tablet', 'desktop') then p_device else '' end,
    left(coalesce(p_label, ''), 160), me
  );
  -- signed in: this visit's earlier rows (before they signed in) are theirs too
  if me is not null then
    update public.site_events set profile_id = me
     where session_id = left(p_session, 64) and profile_id is null;
  end if;
end;
$$;

-- ---------------------------------------------------------------- 3. traffic with real orders

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
  s1 as (
    select s.*, (views <= 1 and not cart and not checkout) as bounced from s
  ),
  o as (
    select x.id, x.created_at, x.session_id, x.total from public.orders x
     where x.created_at >= t0 and x.created_at < t1 and x.status <> 'cancelled'
  ),
  -- orders placed during a visit we saw (0048), counted against that visit
  os as (
    select session_id, count(*) as n, sum(total) as sales from o
     where session_id is not null group by session_id
  ),
  s2 as (
    select s1.*, coalesce(os.n, 0) as ordered, coalesce(os.sales, 0) as sales
      from s1 left join os on os.session_id = s1.session_id
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
    'orders_linked', (select count(*) from o where session_id is not null),
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
               count(*) filter (where cart) as cart, count(*) filter (where checkout) as checkout,
               count(*) filter (where ordered > 0) as ordered, coalesce(sum(sales), 0) as sales
          from s2 group by source) x),
    'devices', (
      select coalesce(jsonb_agg(x order by x.sessions desc), '[]') from (
        select device as name, count(*) as sessions, sum(views) as views,
               count(*) filter (where bounced) as bounced,
               count(*) filter (where cart) as cart, count(*) filter (where checkout) as checkout,
               count(*) filter (where ordered > 0) as ordered, coalesce(sum(sales), 0) as sales
          from s2 group by device) x),
    'landing', (
      select coalesce(jsonb_agg(x order by x.sessions desc), '[]') from (
        select landing as name, count(*) as sessions,
               count(*) filter (where bounced) as bounced,
               count(*) filter (where checkout) as checkout,
               count(*) filter (where ordered > 0) as ordered
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
