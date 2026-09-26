-- Categories, products, variants and images. No dependency on earlier files
-- other than public.is_admin() and public.touch_updated_at() from 0001.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order int not null default 0,
  is_visible boolean not null default true,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists categories_touch_updated_at on public.categories;
create trigger categories_touch_updated_at
  before update on public.categories
  for each row execute function public.touch_updated_at();

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  slug text not null unique,
  name text not null,
  description text not null default '',
  brand text not null default '',
  is_visible boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_category_id_idx on public.products (category_id);

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

-- Every product has at least one variant, even one with no real options
-- (label 'Default'). Price and stock always live here, never on the product,
-- so carts and orders only ever need to know about one kind of row.
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  label text not null default 'Default',
  sku text unique,
  price_paise int not null check (price_paise >= 0),
  stock_qty int not null default 0 check (stock_qty >= 0),
  is_visible boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_variants_product_id_idx on public.product_variants (product_id);

drop trigger if exists product_variants_touch_updated_at on public.product_variants;
create trigger product_variants_touch_updated_at
  before update on public.product_variants
  for each row execute function public.touch_updated_at();

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete cascade,
  storage_path text not null,
  alt_text text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists product_images_product_id_idx on public.product_images (product_id);

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;

-- Everyone (including a signed-out visitor) sees visible rows; admins see all.
drop policy if exists "read visible categories" on public.categories;
create policy "read visible categories" on public.categories
  for select to anon, authenticated
  using (is_visible or public.is_admin());

drop policy if exists "admins write categories" on public.categories;
create policy "admins write categories" on public.categories
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "read visible products" on public.products;
create policy "read visible products" on public.products
  for select to anon, authenticated
  using (is_visible or public.is_admin());

drop policy if exists "admins write products" on public.products;
create policy "admins write products" on public.products
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "read visible variants" on public.product_variants;
create policy "read visible variants" on public.product_variants
  for select to anon, authenticated
  using (is_visible or public.is_admin());

drop policy if exists "admins write variants" on public.product_variants;
create policy "admins write variants" on public.product_variants
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "read product images" on public.product_images;
create policy "read product images" on public.product_images
  for select to anon, authenticated
  using (true);

drop policy if exists "admins write product images" on public.product_images;
create policy "admins write product images" on public.product_images
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.categories, public.products, public.product_variants, public.product_images
  from anon, authenticated;
grant select on public.categories, public.products, public.product_variants, public.product_images
  to anon, authenticated;
grant insert, update, delete on public.categories, public.products, public.product_variants, public.product_images
  to authenticated;

-- Verify:
--   select count(*) from pg_tables where schemaname='public'
--     and tablename in ('categories','products','product_variants','product_images');  -- 4
--   select policyname from pg_policies where tablename in
--     ('categories','products','product_variants','product_images') order by 1;         -- 8 rows
