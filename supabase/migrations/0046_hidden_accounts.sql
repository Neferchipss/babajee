-- Hidden accounts: host accounts managed in Supabase itself (not customers),
-- which the Babajee admin never shows and the shop never records.
--
-- 1. profiles.hidden (boolean). Set it in Supabase (Table editor or SQL):
--      update public.profiles set hidden = true where id = '<user id>';
--    tahalaiq32@gmail.com is set here.
-- 2. Nothing is recorded for a hidden account: its browsing (track_event),
--    its sign-ins and failed sign-ins (login history). What was recorded
--    before is deleted here.
-- 3. The admin leaves it out of every list: Customers (and so the search and
--    each customer's page), Carts, Sign-ins, Admins, and the most-saved
--    products. Its row in profiles stays (the account needs it).
--
-- Check (read-only) afterwards:
--   select p.hidden from public.profiles p join auth.users u on u.id = p.id
--    where lower(u.email) = 'tahalaiq32@gmail.com';                                  -- true
--   select count(*) from public.login_events l join public.profiles p on p.id = l.profile_id
--    where p.hidden;                                                                    -- 0

-- ---------------------------------------------------------------- 1. the mark

alter table public.profiles add column if not exists hidden boolean not null default false;

update public.profiles p set hidden = true
  from auth.users u
 where u.id = p.id and lower(u.email) = 'tahalaiq32@gmail.com' and not p.hidden;

-- what was recorded before
delete from public.login_events l
 using public.profiles p
 where p.hidden and (l.profile_id = p.id or l.email = (select lower(email) from auth.users where id = p.id));
delete from public.site_events e using public.profiles p where p.hidden and e.profile_id = p.id;

-- ---------------------------------------------------------------- 2. nothing recorded

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
  -- a hidden account: nothing kept, not even this visit's rows from before it signed in
  if me is not null and exists (select 1 from public.profiles where id = me and hidden) then
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
     where u.id = new.user_id and not coalesce(p.hidden, false);
    delete from public.login_events where created_at < now() - interval '180 days';
  exception when others then
    null; -- a history row is never worth a failed sign-in
  end;
  return new;
end;
$$;

create or replace function public.log_failed_login(p_email text, p_reason text, p_user_agent text default ''::text)
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
  -- a hidden account's failed attempts aren't kept either
  if exists (select 1 from auth.users u join public.profiles p on p.id = u.id where lower(u.email) = e and p.hidden) then
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

-- ---------------------------------------------------------------- 3. out of the admin's lists

-- Customers (also the admin search and each customer's page)
drop function if exists public.admin_customers();

create or replace function public.admin_customers()
returns table (id uuid, full_name text, phone text, email text, role text, joined timestamptz,
               orders bigint, spent numeric, last_order timestamptz, is_test boolean,
               tags text[], city text, state text, date_of_birth date)
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
    select p.id, p.full_name, p.phone, coalesce(u.email, '')::text, p.role, p.created_at,
           count(o.id), coalesce(sum(o.total) filter (where o.status not in ('cancelled', 'refunded')), 0),
           max(o.created_at), p.is_test, p.tags,
           coalesce(a.city, lo.address_city, ''), coalesce(a.state, lo.address_state, ''),
           p.date_of_birth
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.orders o on o.profile_id = p.id
      left join lateral (
        select ad.city, ad.state from public.addresses ad
         where ad.profile_id = p.id order by ad.is_default desc, ad.created_at desc limit 1) a on true
      left join lateral (
        select x.address_city, x.address_state from public.orders x
         where x.profile_id = p.id order by x.created_at desc limit 1) lo on true
     where not p.hidden
     group by p.id, u.email, a.city, a.state, lo.address_city, lo.address_state
     order by max(o.created_at) desc nulls last, p.created_at desc;
end;
$$;

revoke all on function public.admin_customers() from public, anon;
grant execute on function public.admin_customers() to authenticated;

-- Carts
create or replace function public.admin_carts()
returns table (profile_id uuid, full_name text, phone text, email text, lines jsonb, updated_at timestamptz, last_order_at timestamptz)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select c.profile_id,
           p.full_name,
           p.phone,
           u.email::text,
           c.lines,
           c.updated_at,
           (select max(o.created_at) from public.orders o where o.profile_id = c.profile_id)
      from public.carts c
      join public.profiles p on p.id = c.profile_id and not coalesce(p.is_test, false) and not p.hidden
      left join auth.users u on u.id = c.profile_id
     where jsonb_array_length(c.lines) > 0
     order by c.updated_at desc;
end;
$$;

-- Most-saved products (Analytics)
create or replace function public.admin_saved_products()
returns table (slug text, name text, category text, category_slug text, saves bigint, last_saved timestamptz)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select s.product_slug,
           coalesce(p.name, max(s.item ->> 'name'), s.product_slug),
           coalesce(c.name, ''),
           coalesce(c.slug, ''),
           count(*)::bigint,
           max(s.created_at)
      from public.saved_products s
      join public.profiles pr on pr.id = s.profile_id and not coalesce(pr.is_test, false) and not pr.hidden
      left join public.products p on p.slug = s.product_slug
      left join public.categories c on c.id = p.category_id
     group by s.product_slug, p.name, c.name, c.slug
     order by count(*) desc, max(s.created_at) desc;
end;
$$;

-- Sign-ins
create or replace function public.admin_login_events(p_profile uuid default null::uuid, p_failed_only boolean default false, p_limit integer default 200)
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
         and not coalesce(p.hidden, false)
       order by l.created_at desc
       limit least(greatest(coalesce(p_limit, 200), 1), 1000)) x), '[]');
end;
$$;

-- Admins
create or replace function public.admin_team()
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
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'name', p.full_name, 'email', u.email,
             'last_sign_in', u.last_sign_in_at, 'joined', p.created_at, 'me', p.id = auth.uid())
           order by p.created_at)
      from public.profiles p join auth.users u on u.id = p.id
     where p.role = 'admin' and not p.hidden), '[]');
end;
$$;
