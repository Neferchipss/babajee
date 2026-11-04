-- Customers: tags, saved groups, and adding a customer by hand.
-- 1. profiles.tags, set only by admins (customers can still edit just their
--    own name and phone, 0001).
-- 2. admin_customers() also returns tags, city and state (the default saved
--    address, else the latest order's), for groups and export.
-- 3. customer_segments: groups an admin builds ("spent over ₹5,000 in Pune"),
--    stored as rules the Customers page applies.
-- 4. admin_add_customer(): a customer typed in by the shop, for phone and
--    WhatsApp buyers. Their account has no password, so it can't sign in;
--    signing up later with the same email claims it.
-- Depends on 0001, 0002, 0014, 0024. Safe to re-run.

-- ---------------------------------------------------------------- 1. tags

alter table public.profiles add column if not exists tags text[] not null default '{}';

create or replace function public.admin_set_customer_tags(p_customer uuid, p_tags text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  update public.profiles
     set tags = coalesce((select array_agg(distinct left(trim(t), 40)) from unnest(p_tags) t where trim(t) <> ''), '{}')
   where id = p_customer;
end;
$$;

revoke all on function public.admin_set_customer_tags(uuid, text[]) from public, anon;
grant execute on function public.admin_set_customer_tags(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------- 2. the list, with tags and place

drop function if exists public.admin_customers();

create or replace function public.admin_customers()
returns table (id uuid, full_name text, phone text, email text, role text, joined timestamptz,
               orders bigint, spent numeric, last_order timestamptz, is_test boolean,
               tags text[], city text, state text)
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
           coalesce(a.city, lo.address_city, ''), coalesce(a.state, lo.address_state, '')
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.orders o on o.profile_id = p.id
      left join lateral (
        select ad.city, ad.state from public.addresses ad
         where ad.profile_id = p.id order by ad.is_default desc, ad.created_at desc limit 1) a on true
      left join lateral (
        select x.address_city, x.address_state from public.orders x
         where x.profile_id = p.id order by x.created_at desc limit 1) lo on true
     group by p.id, u.email, a.city, a.state, lo.address_city, lo.address_state
     order by max(o.created_at) desc nulls last, p.created_at desc;
end;
$$;

revoke all on function public.admin_customers() from public, anon;
grant execute on function public.admin_customers() to authenticated;

-- ---------------------------------------------------------------- 3. saved groups

create table if not exists public.customer_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  -- [{ "field": "spent", "op": "gte", "value": 5000 }, ...], all must match
  rules jsonb not null default '[]',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.customer_segments enable row level security;
drop policy if exists "admins manage segments" on public.customer_segments;
create policy "admins manage segments" on public.customer_segments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.customer_segments from anon, authenticated;
grant select, insert, update, delete on public.customer_segments to authenticated;

-- ---------------------------------------------------------------- 4. add a customer by hand

-- p_address: { line1, line2, landmark, city, state, pincode } or null
create or replace function public.admin_add_customer(p_name text, p_phone text, p_email text, p_address jsonb default null, p_tags text[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  nm text := left(trim(coalesce(p_name, '')), 120);
  ph text := left(trim(coalesce(p_phone, '')), 32);
  em text := nullif(lower(trim(coalesce(p_email, ''))), '');
  uid uuid := gen_random_uuid();
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if nm = '' then
    raise exception 'Give the customer a name.';
  end if;
  if ph = '' and em is null then
    raise exception 'Add a phone number or an email, so you can reach them.';
  end if;
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email doesn''t look right.';
  end if;
  if em is not null and exists (select 1 from auth.users u where lower(u.email) = em) then
    raise exception 'Someone with that email already has an account.';
  end if;
  -- the same number with or without +91, spaces or dashes: its last 10 digits
  if length(regexp_replace(ph, '\D', '', 'g')) >= 10 and exists (
       select 1 from public.profiles p
        where right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(ph, '\D', '', 'g'), 10)) then
    raise exception 'Someone with that phone number is already a customer.';
  end if;

  -- no password and no confirmed email: it can't be signed in to, and a
  -- later sign-up with this email takes it over
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em, '',
          '{"provider":"email","providers":["email"],"added_by_admin":true}',
          jsonb_build_object('full_name', nm, 'phone', ph), now(), now(), '', '', '', '');
  update public.profiles
     set full_name = nm, phone = ph, age_verified_at = null,
         tags = coalesce((select array_agg(distinct left(trim(t), 40)) from unnest(p_tags) t where trim(t) <> ''), '{}')
   where id = uid;

  if p_address is not null and coalesce(trim(p_address ->> 'line1'), '') <> '' then
    insert into public.addresses (profile_id, recipient_name, phone, line1, line2, landmark, city, state, pincode, is_default)
    values (uid, nm, ph, trim(p_address ->> 'line1'), coalesce(trim(p_address ->> 'line2'), ''), coalesce(trim(p_address ->> 'landmark'), ''),
            coalesce(trim(p_address ->> 'city'), ''), coalesce(trim(p_address ->> 'state'), ''), coalesce(trim(p_address ->> 'pincode'), ''), true);
  end if;
  return uid;
end;
$$;

revoke all on function public.admin_add_customer(text, text, text, jsonb, text[]) from public, anon;
grant execute on function public.admin_add_customer(text, text, text, jsonb, text[]) to authenticated;
