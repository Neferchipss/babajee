-- Saved for later (the heart), kept on the customer's account when they are
-- signed in, so the shop can see what people want and their list follows
-- them to other devices. Guests' hearts stay in their browser only.
--
-- 1. saved_products: one row per customer and product. item holds what the
--    shop needs to draw the saved list (name, link, tone, price, options).
-- 2. Customers read, add and remove only their own; admins read all.
-- 3. admin_saved_products(): products by how many customers saved them
--    (test accounts left out), for Analytics.
-- Depends on 0001 (profiles, is_admin), 0003 (products, categories),
-- 0024 (profiles.is_test). Safe to re-run.

create table if not exists public.saved_products (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  product_slug text not null,
  item jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (profile_id, product_slug)
);
create index if not exists saved_products_slug on public.saved_products (product_slug);

alter table public.saved_products enable row level security;

drop policy if exists "read own saved" on public.saved_products;
create policy "read own saved" on public.saved_products
  for select to authenticated
  using ((select auth.uid()) = profile_id);

drop policy if exists "manage own saved" on public.saved_products;
create policy "manage own saved" on public.saved_products
  for all to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

drop policy if exists "admins read all saved" on public.saved_products;
create policy "admins read all saved" on public.saved_products
  for select to authenticated
  using (public.is_admin());

revoke all on public.saved_products from anon, public;
grant select, insert, update, delete on public.saved_products to authenticated;

create or replace function public.admin_saved_products()
returns table (slug text, name text, category text, category_slug text, saves bigint, last_saved timestamptz)
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
    select s.product_slug,
           coalesce(p.name, max(s.item ->> 'name'), s.product_slug),
           coalesce(c.name, ''),
           coalesce(c.slug, ''),
           count(*)::bigint,
           max(s.created_at)
      from public.saved_products s
      join public.profiles pr on pr.id = s.profile_id and not coalesce(pr.is_test, false)
      left join public.products p on p.slug = s.product_slug
      left join public.categories c on c.id = p.category_id
     group by s.product_slug, p.name, c.name, c.slug
     order by count(*) desc, max(s.created_at) desc;
end;
$$;

revoke all on function public.admin_saved_products() from public, anon;
grant execute on function public.admin_saved_products() to authenticated;
