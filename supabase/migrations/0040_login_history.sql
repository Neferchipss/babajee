-- Login history and failed logins, for the admin.
--
-- 1. login_events: one row per sign-in or failed attempt: the account (when
--    known), the email typed, whether it worked, why not, the browser and
--    the network address (IP), kept 180 days. The privacy policy says so.
-- 2. Successful sign-ins are recorded by the database itself: a trigger on
--    auth.sessions, which gets a row every time someone signs in (any
--    method). It can never block a sign-in: any error in it is swallowed.
-- 3. Failed attempts are reported by the login form (log_failed_login),
--    since a wrong password never reaches the database. Anyone can call it,
--    so these rows are information, not proof; it keeps to short strings and
--    at most 20 rows per email per hour.
-- 4. admin_login_events(profile, failed_only, limit): newest first, admins
--    only; with a profile, that customer's (by account, or by their email).
-- Depends on 0001 (profiles, is_admin). Safe to re-run.

create table if not exists public.login_events (
  id bigint generated always as identity primary key,
  profile_id uuid references public.profiles (id) on delete set null,
  email text not null default '',
  ok boolean not null,
  reason text not null default '',
  user_agent text not null default '',
  ip text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists login_events_created on public.login_events (created_at desc);
create index if not exists login_events_profile on public.login_events (profile_id, created_at desc);
create index if not exists login_events_email on public.login_events (email, created_at desc);

alter table public.login_events enable row level security;
-- no policies: only the functions below (definer rights) read or write it
revoke all on public.login_events from anon, authenticated, public;

-- the caller's network address as the API saw it (first of x-forwarded-for)
create or replace function public.request_ip()
returns text
language sql
stable
set search_path = ''
as $$
  select left(coalesce(
    nullif(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1), ''),
    current_setting('request.headers', true)::json ->> 'cf-connecting-ip',
    ''), 64);
$$;

create or replace function public.login_events_from_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.login_events (profile_id, email, ok, user_agent, ip)
    select p.id, coalesce(u.email, ''), true, left(coalesce(new.user_agent, ''), 300), left(coalesce(host(new.ip), ''), 64)
      from auth.users u left join public.profiles p on p.id = u.id
     where u.id = new.user_id;
    delete from public.login_events where created_at < now() - interval '180 days';
  exception when others then
    null; -- a history row is never worth a failed sign-in
  end;
  return new;
end;
$$;

drop trigger if exists login_events_on_session on auth.sessions;
create trigger login_events_on_session
  after insert on auth.sessions
  for each row execute function public.login_events_from_session();

create or replace function public.log_failed_login(p_email text, p_reason text, p_user_agent text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e text := lower(left(trim(coalesce(p_email, '')), 200));
begin
  if e = '' then
    return;
  end if;
  if (select count(*) from public.login_events where email = e and not ok and created_at > now() - interval '1 hour') >= 20 then
    return;
  end if;
  insert into public.login_events (profile_id, email, ok, reason, user_agent, ip)
  values (
    (select p.id from auth.users u join public.profiles p on p.id = u.id where lower(u.email) = e limit 1),
    e, false, left(coalesce(p_reason, ''), 80), left(coalesce(p_user_agent, ''), 300), public.request_ip());
end;
$$;

create or replace function public.admin_login_events(p_profile uuid default null, p_failed_only boolean default false, p_limit int default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  em text;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if p_profile is not null then
    select lower(email) into em from auth.users where id = p_profile;
  end if;
  return coalesce((
    select jsonb_agg(x order by x.at desc) from (
      select l.id, l.profile_id, l.email, l.ok, l.reason, l.user_agent, l.ip, l.created_at as at,
             coalesce(nullif(p.full_name, ''), '') as name
        from public.login_events l left join public.profiles p on p.id = l.profile_id
       where (p_profile is null or l.profile_id = p_profile or (em is not null and l.email = em))
         and (not p_failed_only or not l.ok)
       order by l.created_at desc
       limit least(greatest(coalesce(p_limit, 200), 1), 1000)) x), '[]');
end;
$$;

revoke all on function public.request_ip() from public, anon, authenticated;
revoke all on function public.login_events_from_session() from public, anon, authenticated;
revoke all on function public.log_failed_login(text, text, text) from public;
grant execute on function public.log_failed_login(text, text, text) to anon, authenticated;
revoke all on function public.admin_login_events(uuid, boolean, int) from public, anon;
grant execute on function public.admin_login_events(uuid, boolean, int) to authenticated;
