-- Live view: who is on the shop right now. Visits with anything in the last
-- few minutes (5 unless asked), each with the page they're on, their device,
-- where they came from, and whether they've added to a cart or reached
-- checkout; the pages being looked at; and today's visits, orders and sales
-- so far. Admin pages, staff and test accounts are never tracked (0048), so
-- they never show here. Re-run safe. Depends on 0013, 0036, 0048, 0049.

create or replace function public.admin_live_view(p_minutes int default 5)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since timestamptz := now() - make_interval(mins => greatest(1, least(coalesce(p_minutes, 5), 60)));
  today timestamptz := ((now() at time zone 'Asia/Kolkata')::date::timestamp at time zone 'Asia/Kolkata');
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  with live as (
    select e.session_id,
           (array_agg(split_part(e.path, '#', 1) order by e.created_at desc, e.id desc) filter (where e.kind in ('view', 'product', 'cart', 'checkout')))[1] as page,
           (array_agg(e.label order by e.created_at desc, e.id desc) filter (where e.kind = 'product'))[1] as looking_at,
           max(e.created_at) as last_at,
           (array_agg(e.device order by e.created_at) filter (where e.device <> ''))[1] as device,
           max(e.profile_id::text)::uuid as profile_id
      from public.site_events e
     where e.created_at >= since
     group by e.session_id
  ), visit as (
    -- the whole visit (today), for where it came from and how far it got
    select e.session_id, min(e.created_at) as started, count(*) filter (where e.kind in ('view', 'product')) as pages,
           (array_agg(e.referrer order by e.created_at) filter (where e.referrer <> ''))[1] as referrer,
           (array_agg(e.campaign order by e.created_at) filter (where e.campaign <> ''))[1] as campaign,
           count(*) filter (where e.kind = 'add') as adds,
           bool_or(e.kind in ('checkout', 'step')) as checkout
      from public.site_events e
     where e.session_id in (select session_id from live) and e.created_at >= today - interval '1 day'
     group by e.session_id
  )
  select jsonb_build_object(
    'minutes', greatest(1, least(coalesce(p_minutes, 5), 60)),
    'now', now(),
    'visitors', (select count(*) from live),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'session', l.session_id, 'page', coalesce(l.page, ''), 'looking_at', coalesce(l.looking_at, ''),
               'last_at', l.last_at, 'started', v.started, 'device', coalesce(l.device, ''),
               'referrer', coalesce(v.referrer, ''), 'campaign', coalesce(v.campaign, ''),
               'pages', v.pages, 'adds', v.adds, 'checkout', coalesce(v.checkout, false),
               'customer', coalesce(nullif(p.full_name, ''), case when p.id is not null then 'Signed in' end, '')
             ) order by l.last_at desc)
        from live l join visit v using (session_id)
        left join public.profiles p on p.id = l.profile_id), '[]'),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object('page', x.page, 'visitors', x.n) order by x.n desc)
        from (select split_part(page, '?', 1) as page, count(*) as n from live where page is not null group by 1 order by 2 desc limit 12) x), '[]'),
    'today', jsonb_build_object(
      'visits', (select count(distinct session_id) from public.site_events where created_at >= today),
      'orders', (select count(*) from public.orders where created_at >= today and status <> 'cancelled' and not is_test),
      'sales', (select coalesce(sum(total), 0) from public.orders where created_at >= today and status not in ('cancelled', 'pending') and not is_test)
    )
  ) into r;
  return r;
end;
$$;
revoke all on function public.admin_live_view(int) from public, anon;
grant execute on function public.admin_live_view(int) to authenticated;
