-- Data for the person who reads it: history that can't be rebuilt later,
-- what visitors look for, where checkout loses them, who comes back, and
-- one download with everything.
--
-- 1. stock_daily: one row per variant per day (India time) with its stock,
--    price and whether it was on the shelf, so "sold little" can be told
--    apart from "was sold out". pg_cron takes it at 23:55 every night;
--    snapshot_stock() is safe to run again (the day's row is updated).
-- 2. site_events gets visitor_id (a random id kept in the browser across
--    visits), campaign ("source/medium/campaign" from utm_ tags on the link
--    that started the visit) and value (a number for the event), and two new
--    kinds: 'search' (label = what was typed, value = how many products
--    matched) and 'step' (label = a checkout step: 'sign-in needed',
--    'submit', 'blocked: ...', 'error: ...').
-- 3. admin_traffic_insights(): searches, searches with no results, checkout
--    steps, campaigns with real orders, new vs returning visitors, and how
--    many visits and days an order took.
-- 4. Download all data: admin_export_tables() lists the tables and columns,
--    admin_export(table, offset, limit) pages through one, and
--    admin_log_export() puts each download in the activity log.
--
-- Depends on 0013, 0036, 0042, 0046, 0048. Safe to re-run.
--
-- Check (read-only) afterwards:
--   select day, count(*) from public.stock_daily group by day;           -- today, ~529 rows
--   select jobname, schedule from cron.job;                               -- babajee-stock-daily
--   select column_name from information_schema.columns
--    where table_name = 'site_events' and column_name in ('visitor_id', 'campaign', 'value');  -- 3 rows

-- ---------------------------------------------------------------- 1. stock history

create table if not exists public.stock_daily (
  day date not null,
  variant_id uuid not null,          -- no foreign key: history outlives a deleted variant
  product_id uuid not null,
  sku text not null default '',
  stock_qty integer,
  track_stock boolean,
  price numeric,
  compare_at numeric,
  listed boolean not null,           -- product and variant both visible
  product_status text not null default '',
  taken_at timestamptz not null default now(),
  primary key (day, variant_id)
);
create index if not exists stock_daily_variant_idx on public.stock_daily (variant_id, day);

alter table public.stock_daily enable row level security;
drop policy if exists "admins read stock history" on public.stock_daily;
create policy "admins read stock history" on public.stock_daily
  for select to authenticated using (public.is_admin());
revoke all on public.stock_daily from anon, authenticated;
grant select on public.stock_daily to authenticated;

create or replace function public.snapshot_stock()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.stock_daily (day, variant_id, product_id, sku, stock_qty, track_stock, price, compare_at, listed, product_status, taken_at)
  select (now() at time zone 'Asia/Kolkata')::date, v.id, v.product_id, coalesce(v.sku, ''), v.stock_qty, v.track_stock,
         v.price, v.compare_at, (v.is_visible and p.is_visible), coalesce(p.status, ''), now()
    from public.product_variants v
    join public.products p on p.id = v.product_id
  on conflict (day, variant_id) do update
     set stock_qty = excluded.stock_qty, track_stock = excluded.track_stock, price = excluded.price,
         compare_at = excluded.compare_at, listed = excluded.listed, product_status = excluded.product_status,
         taken_at = excluded.taken_at, sku = excluded.sku;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.snapshot_stock() from public, anon, authenticated;

create extension if not exists pg_cron;
-- 23:55 India time = 18:25 UTC; scheduling under the same name replaces the job
select cron.schedule('babajee-stock-daily', '25 18 * * *', 'select public.snapshot_stock()');
-- today's, so the history starts now
select public.snapshot_stock();

-- ---------------------------------------------------------------- 2. richer events

alter table public.site_events add column if not exists visitor_id text;
alter table public.site_events add column if not exists campaign text not null default '';
alter table public.site_events add column if not exists value integer;
create index if not exists site_events_visitor_idx on public.site_events (visitor_id, created_at) where visitor_id is not null;

alter table public.site_events drop constraint if exists site_events_kind_check;
alter table public.site_events add constraint site_events_kind_check
  check (kind in ('view', 'cart', 'checkout', 'product', 'add', 'search', 'step'));

-- one function, new arguments with defaults: pages still open from before keep working
drop function if exists public.track_event(text, text, text, text, text, text);

create or replace function public.track_event(
  p_session text, p_kind text, p_path text, p_referrer text, p_device text, p_label text default '',
  p_visitor text default '', p_campaign text default '', p_value integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if p_kind not in ('view', 'cart', 'checkout', 'product', 'add', 'search', 'step')
     or length(coalesce(p_session, '')) not between 8 and 64 then
    return;
  end if;
  -- a hidden account or staff: nothing kept, not even this visit's rows from before it signed in
  if me is not null and exists (select 1 from public.profiles where id = me and (hidden or role = 'admin')) then
    delete from public.site_events where session_id = left(p_session, 64) and profile_id is null;
    return;
  end if;
  insert into public.site_events (session_id, kind, path, referrer, device, label, profile_id, visitor_id, campaign, value)
  values (
    left(p_session, 64), p_kind, left(coalesce(p_path, ''), 200), left(coalesce(p_referrer, ''), 120),
    case when p_device in ('mobile', 'tablet', 'desktop') then p_device else '' end,
    left(coalesce(p_label, ''), 160), me,
    case when length(coalesce(p_visitor, '')) between 8 and 64 then p_visitor end,
    left(coalesce(p_campaign, ''), 160),
    case when p_value between -1000000 and 1000000 then p_value end
  );
  -- signed in: this visit's earlier rows (before they signed in) are theirs too
  if me is not null then
    update public.site_events set profile_id = me
     where session_id = left(p_session, 64) and profile_id is null;
  end if;
end;
$$;

revoke all on function public.track_event(text, text, text, text, text, text, text, text, integer) from public;
grant execute on function public.track_event(text, text, text, text, text, text, text, text, integer) to anon, authenticated;

-- ---------------------------------------------------------------- 3. insights

create or replace function public.admin_traffic_insights(p_from date, p_to date)
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
  sess as (
    select session_id,
           min(created_at) as t_start,
           coalesce(nullif((array_agg(campaign order by created_at) filter (where campaign <> ''))[1], ''), '') as campaign,
           (array_agg(visitor_id order by created_at) filter (where visitor_id is not null))[1] as visitor_id,
           bool_or(kind = 'checkout') as checkout
      from ev group by session_id
  ),
  o as (
    select x.id, x.created_at, x.session_id, x.total from public.orders x
     where x.created_at >= t0 and x.created_at < t1 and x.status <> 'cancelled'
  ),
  os as (
    select session_id, count(*) as n, sum(total) as sales from o where session_id is not null group by session_id
  ),
  -- searches: one row per query per visit (the last count of results it saw)
  srch as (
    select distinct on (session_id, lower(trim(label)))
           session_id, lower(trim(label)) as q, coalesce(value, 0) as hits
      from ev where kind = 'search' and trim(label) <> ''
     order by session_id, lower(trim(label)), created_at desc
  ),
  -- visitors seen in the range, and whether we knew them before it
  vis as (
    select s.visitor_id, count(*) as visits,
           (select min(e.created_at) from public.site_events e where e.visitor_id = s.visitor_id) as first_seen
      from sess s where s.visitor_id is not null group by s.visitor_id
  ),
  -- orders tied to a visit by a known visitor: how many visits and days it took
  path as (
    select o.id,
           (select count(distinct e.session_id) from public.site_events e
             where e.visitor_id = s.visitor_id and e.created_at <= o.created_at) as visits,
           extract(epoch from o.created_at - (select min(e.created_at) from public.site_events e where e.visitor_id = s.visitor_id)) / 86400.0 as days
      from o join sess s on s.session_id = o.session_id
     where s.visitor_id is not null
  )
  select jsonb_build_object(
    'searches', (
      select coalesce(jsonb_agg(x order by x.visits desc, x.q), '[]') from (
        select q, count(*) as visits, round(avg(hits), 1) as avg_hits, count(*) filter (where hits = 0) as empty
          from srch group by q order by count(*) desc, q limit 20) x),
    'empty_searches', (
      select coalesce(jsonb_agg(x order by x.visits desc, x.q), '[]') from (
        select q, count(*) as visits from srch where hits = 0 group by q order by count(*) desc, q limit 20) x),
    'search_visits', (select count(distinct session_id) from srch),
    'steps', (
      select coalesce(jsonb_agg(x order by x.visits desc), '[]') from (
        select label as step, count(distinct session_id) as visits, count(*) as times
          from ev where kind = 'step' group by label) x),
    'checkout_visits', (select count(*) from sess where checkout),
    'campaigns', (
      select coalesce(jsonb_agg(x order by x.visits desc), '[]') from (
        select s.campaign as name, count(*) as visits,
               count(*) filter (where os.n > 0) as ordered, coalesce(sum(os.sales), 0) as sales
          from sess s left join os on os.session_id = s.session_id
         where s.campaign <> '' group by s.campaign) x),
    'visitors', (select count(*) from vis),
    'new_visitors', (select count(*) from vis where first_seen >= t0),
    'returning_visitors', (select count(*) from vis where first_seen < t0 or visits > 1),
    'visits_untagged', (select count(*) from sess where visitor_id is null),
    'to_order', (
      select jsonb_build_object(
        'orders', count(*),
        'visits_median', percentile_cont(0.5) within group (order by visits),
        'visits_avg', round(avg(visits)::numeric, 2),
        'days_median', round((percentile_cont(0.5) within group (order by days))::numeric, 2),
        'first_visit', count(*) filter (where visits = 1),
        'two_three', count(*) filter (where visits between 2 and 3),
        'four_plus', count(*) filter (where visits >= 4))
        from path)
  ) into r;
  return r;
end;
$$;

revoke all on function public.admin_traffic_insights(date, date) from public, anon;
grant execute on function public.admin_traffic_insights(date, date) to authenticated;

-- ---------------------------------------------------------------- 4. download all data

-- what goes in the download (not the invoice counter or store settings)
create or replace function public.export_table_list()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['addresses', 'audit_log', 'cart_items', 'carts', 'categories', 'collection_items', 'collections',
               'customer_notes', 'customer_segments', 'login_events', 'order_events', 'order_item_costs', 'order_items',
               'order_refund_items', 'order_refunds', 'order_requests', 'orders', 'payments', 'product_images',
               'product_reviews', 'product_variants', 'products', 'profiles', 'saved_products', 'shipments',
               'site_events', 'stock_daily', 'stock_movements', 'variant_costs'];
$$;

-- tables, row counts and columns, for the zip and its README
create or replace function public.admin_export_tables()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t text;
  n bigint;
  out jsonb := '[]';
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  foreach t in array public.export_table_list() loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    if t = 'profiles' then
      select count(*) into n from public.profiles where not hidden;
    else
      execute format('select count(*) from public.%I', t) into n;
    end if;
    out := out || jsonb_build_array(jsonb_build_object(
      'table', t,
      'rows', n,
      'columns', (
        select jsonb_agg(jsonb_build_object('name', c.column_name, 'type', c.data_type) order by c.ordinal_position)
          from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = t)
        || case when t = 'profiles' then jsonb_build_array(jsonb_build_object('name', 'email', 'type', 'text')) else '[]'::jsonb end));
  end loop;
  return out;
end;
$$;

-- one page of one table, in primary-key order
create or replace function public.admin_export(p_table text, p_offset integer, p_limit integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  keys text;
  src text;
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if not (p_table = any (public.export_table_list())) or to_regclass('public.' || p_table) is null then
    raise exception 'Unknown table %', p_table using errcode = '22023';
  end if;
  select string_agg(format('t.%I', a.attname), ', ' order by array_position(i.indkey, a.attnum))
    into keys
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
   where i.indrelid = ('public.' || p_table)::regclass and i.indisprimary;
  src := case when p_table = 'profiles'
    then 'select p.*, u.email::text as email from public.profiles p join auth.users u on u.id = p.id where not p.hidden'
    else format('select * from public.%I', p_table) end;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]'') from (select * from (%s) t order by %s offset %s limit %s) t',
                 src, coalesce(keys, '1'), greatest(p_offset, 0), least(greatest(p_limit, 1), 10000))
    into r;
  return r;
end;
$$;

create or replace function public.admin_log_export()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  insert into public.audit_log (actor_id, actor_name, area, row_id, label, action, changes)
  values (me,
          coalesce((select nullif(full_name, '') from public.profiles where id = me), (select email from auth.users where id = me), ''),
          'export', '', 'All data', 'downloaded', null);
end;
$$;

revoke all on function public.export_table_list() from public, anon;
revoke all on function public.admin_export_tables() from public, anon;
revoke all on function public.admin_export(text, integer, integer) from public, anon;
revoke all on function public.admin_log_export() from public, anon;
grant execute on function public.export_table_list() to authenticated;
grant execute on function public.admin_export_tables() to authenticated;
grant execute on function public.admin_export(text, integer, integer) to authenticated;
grant execute on function public.admin_log_export() to authenticated;
