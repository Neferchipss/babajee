-- Customer activity: what a signed-in customer did on the site, as a timeline
-- on their admin page. (The privacy policy says the shop keeps this.)
--
-- 1. site_events.profile_id: the account behind a visit. Set by track_event
--    when the visitor is signed in; signing in also claims the earlier rows
--    of the same visit, so how they arrived (referrer) stays with them.
-- 2. site_events.label, and two new kinds: 'product' (a product opened, label
--    = its name) and 'add' (each add to cart, label = its name). The kinds
--    analytics counts ('view', 'cart', 'checkout') are unchanged.
-- 3. admin_customer_activity(profile): how they first found the shop, when
--    they were last seen, and their latest 300 events, newest first.
-- Depends on 0013 (site_events, track_event). Safe to re-run.

alter table public.site_events add column if not exists profile_id uuid references public.profiles (id) on delete set null;
alter table public.site_events add column if not exists label text not null default '';

alter table public.site_events drop constraint if exists site_events_kind_check;
alter table public.site_events add constraint site_events_kind_check
  check (kind in ('view', 'cart', 'checkout', 'product', 'add'));

create index if not exists site_events_profile_idx on public.site_events (profile_id, created_at desc) where profile_id is not null;
create index if not exists site_events_session_idx on public.site_events (session_id);

drop function if exists public.track_event(text, text, text, text, text);
create or replace function public.track_event(p_session text, p_kind text, p_path text, p_referrer text, p_device text, p_label text default '')
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

revoke all on function public.track_event(text, text, text, text, text, text) from public;
grant execute on function public.track_event(text, text, text, text, text, text) to anon, authenticated;

create or replace function public.admin_customer_activity(p_profile uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'first', (
      select jsonb_build_object('at', e.created_at, 'referrer', e.referrer, 'device', e.device, 'path', e.path)
        from public.site_events e where e.profile_id = p_profile
       order by e.created_at asc limit 1),
    'last_seen', (select max(e.created_at) from public.site_events e where e.profile_id = p_profile),
    'visits', (select count(distinct e.session_id) from public.site_events e where e.profile_id = p_profile),
    'events', (
      select coalesce(jsonb_agg(x order by x.at desc), '[]') from (
        select e.kind, e.path, e.label, e.device, e.referrer, e.session_id as visit, e.created_at as at
          from public.site_events e
         where e.profile_id = p_profile
         order by e.created_at desc
         limit 300) x)
  );
end;
$$;

revoke all on function public.admin_customer_activity(uuid) from public, anon;
grant execute on function public.admin_customer_activity(uuid) to authenticated;
