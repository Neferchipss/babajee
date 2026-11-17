-- Carts in admin: when a cart counts as abandoned and when it is cleared,
-- cart-to-order conversion, and a record of WhatsApp reminders sent by hand
-- (nothing is ever sent by the site).
--
-- 1. store_settings.cart_abandon_hours (default 1): a cart left this long
--    with no order since is abandoned. store_settings.cart_expire_days
--    (default 30, 0 = never): a cart untouched this long is emptied, nightly,
--    by pg_cron (expire_old_carts).
-- 2. carts.reminded_at / carts.reminders: the shop ticks "reminded" after
--    sending a WhatsApp message itself (admin_mark_cart_reminded).
-- 3. admin_carts() also returns reminded_at and reminders.
-- 4. admin_cart_conversion(from, to): visits that added to cart, visits that
--    reached checkout, visits that ordered (orders.session_id, 0048), and
--    signed-in carts that ended in an order.
--
-- Depends on 0005, 0034, 0046, 0048, 0049. Re-run safe.

alter table public.store_settings add column if not exists cart_abandon_hours int not null default 1;
alter table public.store_settings add column if not exists cart_expire_days int not null default 30;
alter table public.store_settings drop constraint if exists store_settings_cart_rules_check;
alter table public.store_settings add constraint store_settings_cart_rules_check
  check (cart_abandon_hours between 1 and 720 and cart_expire_days between 0 and 365);

alter table public.carts add column if not exists reminded_at timestamptz;
alter table public.carts add column if not exists reminders int not null default 0;

-- updated_at moves only when what is in the cart changes (a reminder, or
-- expiry, is not the customer changing it)
drop trigger if exists carts_touch_updated_at on public.carts;
create trigger carts_touch_updated_at
  before update on public.carts
  for each row when (old.lines is distinct from new.lines) execute function public.touch_updated_at();

-- ---------------------------------------------------------------- carts list
drop function if exists public.admin_carts();
create function public.admin_carts()
returns table (profile_id uuid, full_name text, phone text, email text, lines jsonb, updated_at timestamptz, last_order_at timestamptz, reminded_at timestamptz, reminders int)
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
    select c.profile_id, p.full_name, p.phone, u.email::text, c.lines, c.updated_at,
           (select max(o.created_at) from public.orders o where o.profile_id = c.profile_id),
           c.reminded_at, c.reminders
      from public.carts c
      join public.profiles p on p.id = c.profile_id and not coalesce(p.is_test, false) and not p.hidden
      left join auth.users u on u.id = c.profile_id
     where jsonb_array_length(c.lines) > 0
     order by c.updated_at desc;
end;
$$;
revoke all on function public.admin_carts() from public, anon;
grant execute on function public.admin_carts() to authenticated;

-- ---------------------------------------------------------------- reminded by hand
create or replace function public.admin_mark_cart_reminded(p_customer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  update public.carts set reminded_at = now(), reminders = reminders + 1
   where profile_id = p_customer and jsonb_array_length(lines) > 0;
  if not found then
    raise exception 'That cart is empty now.' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.admin_mark_cart_reminded(uuid) from public, anon;
grant execute on function public.admin_mark_cart_reminded(uuid) to authenticated;

-- ---------------------------------------------------------------- expiry
create or replace function public.expire_old_carts()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  days int;
  n int;
begin
  select cart_expire_days into days from public.store_settings where id = 1;
  if coalesce(days, 0) = 0 then
    return 0;
  end if;
  update public.carts set lines = '[]'::jsonb, reminded_at = null, reminders = 0, updated_at = now()
   where jsonb_array_length(lines) > 0 and updated_at < now() - make_interval(days => days);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.expire_old_carts() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('babajee-cart-expiry', '40 18 * * *', 'select public.expire_old_carts()');
  end if;
end $$;

-- ---------------------------------------------------------------- conversion
create or replace function public.admin_cart_conversion(p_from timestamptz, p_to timestamptz)
returns table (visits bigint, carted bigint, checkout bigint, ordered bigint, carted_ordered bigint, accounts_carted bigint, accounts_ordered bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  with ev as (
    select e.session_id,
           bool_or(e.kind in ('add', 'cart')) as added,
           bool_or(e.kind in ('checkout', 'step')) as reached
      from public.site_events e
     where e.created_at >= p_from and e.created_at < p_to
     group by e.session_id
  ), ord as (
    select distinct o.session_id
      from public.orders o
     where o.session_id is not null and o.created_at >= p_from and o.created_at < p_to
       and o.status <> 'cancelled' and not coalesce(o.is_test, false)
  ), acc as (
    -- signed-in customers whose cart changed in the range, and of those who ordered after
    select c.profile_id,
           exists (select 1 from public.orders o where o.profile_id = c.profile_id and o.created_at >= p_from and o.created_at < p_to and not coalesce(o.is_test, false)) as bought
      from public.site_events c
     where c.profile_id is not null and c.kind = 'add' and c.created_at >= p_from and c.created_at < p_to
     group by c.profile_id
  )
  select (select count(*) from ev),
         (select count(*) from ev where added),
         (select count(*) from ev where reached),
         (select count(*) from ord),
         (select count(*) from ev join ord using (session_id) where ev.added),
         (select count(*) from acc),
         (select count(*) from acc where bought);
end;
$$;
revoke all on function public.admin_cart_conversion(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_cart_conversion(timestamptz, timestamptz) to authenticated;
