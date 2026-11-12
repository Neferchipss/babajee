-- Admin users and the activity (audit) log.
--
-- 1. admin_team(): the admins, with email and last sign-in.
--    admin_set_admin(email, on): make an existing account an admin, or stop
--    one being an admin. Never yourself, never the last admin. (Roles stay
--    out of reach of the browser otherwise: 0001's column grants.)
-- 2. audit_log: every change an admin makes to the shop's data, recorded by
--    the database itself: who, when, what (products, options, photos, costs,
--    categories, collections, orders, refunds, customers, notes, groups,
--    reviews, settings), and for an edit each field's old and new value.
--    Customers' own actions are not logged (their orders keep timelines).
--    Kept one year.
-- 3. admin_audit_log(area, actor, before, limit): newest first, admins only.
-- Depends on 0001 (profiles, is_admin) and the tables named below.
-- Safe to re-run.

-- ---------------------------------------------------------------- 1. team
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
     where p.role = 'admin'), '[]');
end;
$$;

create or replace function public.admin_set_admin(p_email text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  who uuid;
  cur text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can do this.' using errcode = '42501';
  end if;
  select u.id, p.role into who, cur
    from auth.users u join public.profiles p on p.id = u.id
   where lower(u.email) = lower(trim(coalesce(p_email, '')));
  if who is null then
    raise exception 'No account with that email. They need to sign up on the shop first.';
  end if;
  if p_on then
    if cur = 'admin' then return; end if;
    update public.profiles set role = 'admin' where id = who;
  else
    if cur <> 'admin' then return; end if;
    if who = auth.uid() then
      raise exception 'You can''t remove yourself. Ask another admin.';
    end if;
    if (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'The shop needs at least one admin.';
    end if;
    update public.profiles set role = 'customer' where id = who;
  end if;
end;
$$;

revoke all on function public.admin_team() from public, anon;
revoke all on function public.admin_set_admin(text, boolean) from public, anon;
grant execute on function public.admin_team() to authenticated;
grant execute on function public.admin_set_admin(text, boolean) to authenticated;

-- ---------------------------------------------------------------- 2. the log
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text not null default '',
  area text not null,
  row_id text not null default '',
  label text not null default '',
  action text not null check (action in ('added', 'changed', 'removed')),
  changes jsonb
);
create index if not exists audit_log_at on public.audit_log (at desc);
create index if not exists audit_log_area on public.audit_log (area, at desc);
create index if not exists audit_log_actor on public.audit_log (actor_id, at desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated, public;

-- what the row is, in words: a product's name, an order's number, an option
-- as "Product · Option"
create or replace function public.audit_label(t text, r jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  out text;
begin
  case t
    when 'products', 'categories', 'collections', 'customer_segments' then out := r ->> 'name';
    when 'orders' then out := r ->> 'order_number';
    when 'product_variants' then
      select p.name || ' · ' || (r ->> 'label') into out from public.products p where p.id = (r ->> 'product_id')::uuid;
    when 'product_images' then
      select p.name into out from public.products p where p.id = (r ->> 'product_id')::uuid;
    when 'variant_costs' then
      select p.name || ' · ' || v.label into out
        from public.product_variants v join public.products p on p.id = v.product_id where v.id = (r ->> 'variant_id')::uuid;
    when 'collection_items' then
      select c.name || ' · ' || p.name into out
        from public.collections c, public.products p
       where c.id = (r ->> 'collection_id')::uuid and p.id = (r ->> 'product_id')::uuid;
    when 'order_refunds' then
      select o.order_number into out from public.orders o where o.id = (r ->> 'order_id')::uuid;
    when 'customer_notes' then
      select coalesce(nullif(full_name, ''), 'A customer') into out from public.profiles where id = (r ->> 'profile_id')::uuid;
    when 'profiles' then out := coalesce(nullif(r ->> 'full_name', ''), 'A customer');
    when 'product_reviews' then
      select p.name into out from public.products p where p.slug = r ->> 'product_slug';
    when 'store_settings' then out := 'Store settings';
    else out := '';
  end case;
  return left(coalesce(out, ''), 200);
end;
$$;

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  o jsonb;
  n jsonb;
  diff jsonb := '{}';
  k text;
  skip text[] := array['updated_at', 'created_at', 'search', 'refresh_token_hmac_key'];
  act text;
  rid text;
begin
  -- only what an admin does (a customer's checkout or their own profile is not logged)
  if me is null or not public.is_admin() then
    return null;
  end if;
  begin
    o := case when tg_op <> 'INSERT' then to_jsonb(old) end;
    n := case when tg_op <> 'DELETE' then to_jsonb(new) end;
    if tg_op = 'UPDATE' then
      for k in select jsonb_object_keys(n) loop
        if not (k = any (skip)) and (o -> k) is distinct from (n -> k) then
          diff := diff || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
        end if;
      end loop;
      if diff = '{}' then
        return null; -- nothing that matters changed
      end if;
    end if;
    act := case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'changed' else 'removed' end;
    rid := coalesce(coalesce(n, o) ->> 'id', coalesce(n, o) ->> 'variant_id', coalesce(n, o) ->> 'product_id', '');
    insert into public.audit_log (actor_id, actor_name, area, row_id, label, action, changes)
    values (
      me,
      coalesce((select nullif(full_name, '') from public.profiles where id = me), (select email from auth.users where id = me), ''),
      tg_table_name, rid, public.audit_label(tg_table_name, coalesce(n, o)), act,
      case when tg_op = 'UPDATE' then diff end);
    if random() < 0.01 then
      delete from public.audit_log where at < now() - interval '1 year';
    end if;
  exception when others then
    null; -- the log never blocks the change itself
  end;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'products', 'product_variants', 'product_images', 'variant_costs', 'categories', 'collections', 'collection_items',
    'orders', 'order_refunds', 'profiles', 'customer_notes', 'customer_segments', 'product_reviews', 'store_settings']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists audit_row on public.%I', t);
      execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- 3. reading it
create or replace function public.admin_audit_log(p_area text default null, p_actor uuid default null, p_before bigint default null, p_limit int default 100)
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
    select jsonb_agg(x order by x.id desc) from (
      select id, at, actor_id, actor_name, area, row_id, label, action, changes
        from public.audit_log
       where (p_area is null or area = any (string_to_array(p_area, ',')))
         and (p_actor is null or actor_id = p_actor)
         and (p_before is null or id < p_before)
       order by id desc
       limit least(greatest(coalesce(p_limit, 100), 1), 500)) x), '[]');
end;
$$;

revoke all on function public.audit_label(text, jsonb) from public, anon, authenticated;
revoke all on function public.audit_row() from public, anon, authenticated;
revoke all on function public.admin_audit_log(text, uuid, bigint, int) from public, anon;
grant execute on function public.admin_audit_log(text, uuid, bigint, int) to authenticated;
