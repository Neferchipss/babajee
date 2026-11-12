-- Carts on the customer's account, so the shop can see active and abandoned
-- carts. The cart still lives in the browser first (src/lib/cart.ts); for a
-- signed-in customer it is copied here after each change, merged on sign-in,
-- and emptied when they order. Guests' carts stay in their browser only.
--
-- 1. carts.lines: the cart as the shop draws it (product, option, price,
--    quantity per line). The carts table (0004) is one row per customer with
--    updated_at kept by a trigger; cart_items (0004) is left unused.
-- 2. Admins can read every cart.
-- 3. admin_carts(): carts with something in them, with the customer's name,
--    phone, email and their latest order, test accounts left out. Whether a
--    cart is active or abandoned is decided on the page from updated_at.
-- Depends on 0001, 0004, 0024 (profiles.is_test). Safe to re-run.

alter table public.carts add column if not exists lines jsonb not null default '[]'::jsonb;

drop policy if exists "admins read all carts" on public.carts;
create policy "admins read all carts" on public.carts
  for select to authenticated
  using (public.is_admin());

create or replace function public.admin_carts()
returns table (
  profile_id uuid,
  full_name text,
  phone text,
  email text,
  lines jsonb,
  updated_at timestamptz,
  last_order_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
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
      join public.profiles p on p.id = c.profile_id and not coalesce(p.is_test, false)
      left join auth.users u on u.id = c.profile_id
     where jsonb_array_length(c.lines) > 0
     order by c.updated_at desc;
end;
$$;

revoke all on function public.admin_carts() from public, anon;
grant execute on function public.admin_carts() to authenticated;
