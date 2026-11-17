-- Sub-categories as tags.
--
-- Each category keeps its own list of sub-categories, managed in the admin
-- (named, ordered, hidden), optionally in groups that read as filter rows on
-- the shop ("Size": 27 inch, 14 inch; "Percs": 2 perc, no perc). A product
-- can carry several of its category's sub-categories at once. Each one has
-- its own page on the shop, /shop/<category>/<sub-category>/, which shares
-- the products' address space: a sub-category's slug can't be a product's,
-- and a product's slug can't be a sub-category's in its category.
--
-- 1. subcategory_groups, subcategories, product_subcategories
-- 2. a product's sub-categories belong to its category (and leave it when
--    it moves)
-- 3. addresses that don't clash
-- 4. who can read and change them
-- 5. the free-text label each product had (0041) brought across
--
-- products.subcategory (0041) is left in place, no longer read by the site.
-- Re-run safe.

-- ---------------------------------------------------------------- 1. tables

create table if not exists public.subcategory_groups (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  name text not null check (btrim(name) <> '' and length(name) <= 40),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists subcategory_groups_name_idx on public.subcategory_groups (category_id, lower(name));

create table if not exists public.subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  group_id uuid references public.subcategory_groups (id) on delete set null,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  name text not null check (btrim(name) <> '' and length(name) <= 40),
  sort_order int not null default 0,
  is_visible boolean not null default true,
  -- its own page's title and description for search engines; empty: worked out
  seo_title text not null default '',
  seo_description text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists subcategories_slug_idx on public.subcategories (category_id, slug);
create unique index if not exists subcategories_name_idx on public.subcategories (category_id, lower(name));

create table if not exists public.product_subcategories (
  product_id uuid not null references public.products (id) on delete cascade,
  subcategory_id uuid not null references public.subcategories (id) on delete cascade,
  primary key (product_id, subcategory_id)
);
create index if not exists product_subcategories_sub_idx on public.product_subcategories (subcategory_id);

-- a name made into an address: "27 Inch Glass!" -> "27-inch-glass"
create or replace function public.slug_of(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(btrim(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '-', 'g'), '-'), 60)
$$;

-- ---------------------------------------------------------------- 2. same category

-- a group belongs to the sub-category's category
create or replace function public.subcategories_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  if new.slug is null or new.slug = '' then
    new.slug := public.slug_of(new.name);
  end if;
  if new.group_id is not null and not exists (
       select 1 from public.subcategory_groups g where g.id = new.group_id and g.category_id = new.category_id) then
    raise exception 'That group belongs to another category.' using errcode = '22023';
  end if;
  -- 3. its page's address can't be a product's
  if exists (select 1 from public.products p where p.slug = new.slug) then
    raise exception 'A product already uses the address "%". Give this sub-category another name or address.', new.slug using errcode = '23505';
  end if;
  return new;
end;
$$;
drop trigger if exists subcategories_check on public.subcategories;
create trigger subcategories_check before insert or update on public.subcategories
  for each row execute function public.subcategories_check();

-- a product carries only its own category's sub-categories
create or replace function public.product_subcategories_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
       select 1 from public.subcategories s join public.products p on p.category_id = s.category_id
        where s.id = new.subcategory_id and p.id = new.product_id) then
    raise exception 'That sub-category belongs to another category.' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists product_subcategories_check on public.product_subcategories;
create trigger product_subcategories_check before insert or update on public.product_subcategories
  for each row execute function public.product_subcategories_check();

-- a product moved to another category leaves its old sub-categories behind;
-- a product's own address can't be one of its category's sub-categories'
create or replace function public.products_subcategory_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.subcategories s where s.slug = new.slug) then
    raise exception 'A sub-category already uses the address "%". Give this product another address.', new.slug using errcode = '23505';
  end if;
  if tg_op = 'UPDATE' and new.category_id is distinct from old.category_id then
    delete from public.product_subcategories ps
     using public.subcategories s
     where ps.product_id = new.id and s.id = ps.subcategory_id and s.category_id <> new.category_id;
  end if;
  return new;
end;
$$;
revoke all on function public.products_subcategory_rules() from public, anon, authenticated;
drop trigger if exists products_subcategory_rules on public.products;
create trigger products_subcategory_rules after insert or update of slug, category_id on public.products
  for each row execute function public.products_subcategory_rules();

-- ---------------------------------------------------------------- 4. access

alter table public.subcategory_groups enable row level security;
alter table public.subcategories enable row level security;
alter table public.product_subcategories enable row level security;

drop policy if exists "read groups" on public.subcategory_groups;
create policy "read groups" on public.subcategory_groups for select to anon, authenticated using (true);
drop policy if exists "admins manage groups" on public.subcategory_groups;
create policy "admins manage groups" on public.subcategory_groups
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read shown subcategories" on public.subcategories;
create policy "read shown subcategories" on public.subcategories
  for select to anon, authenticated using (is_visible or public.is_admin());
drop policy if exists "admins manage subcategories" on public.subcategories;
create policy "admins manage subcategories" on public.subcategories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read product subcategories" on public.product_subcategories;
create policy "read product subcategories" on public.product_subcategories
  for select to anon, authenticated
  using (public.is_admin() or exists (select 1 from public.subcategories s where s.id = subcategory_id and s.is_visible));
drop policy if exists "admins manage product subcategories" on public.product_subcategories;
create policy "admins manage product subcategories" on public.product_subcategories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.subcategory_groups, public.subcategories, public.product_subcategories from anon, authenticated, public;
grant select on public.subcategory_groups, public.subcategories, public.product_subcategories to anon;
grant select, insert, update, delete on public.subcategory_groups, public.subcategories, public.product_subcategories to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['subcategory_groups', 'subcategories', 'product_subcategories'] loop
    execute format('drop trigger if exists audit_row on public.%I', t);
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- 5. bring the old labels across

-- one sub-category per category and label (case ignored), named as most
-- products had it; then each product tagged with its own. A label whose
-- address a product already uses gets "-range" added.
create or replace function public.subcategories_from_labels()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  sid uuid;
  s text;
begin
  for r in
    select p.category_id, lower(btrim(p.subcategory)) as k,
           (array_agg(btrim(p.subcategory) order by btrim(p.subcategory)))[1] as name,
           min(p.sort_order) as first_at
      from public.products p
     where btrim(p.subcategory) <> ''
     group by p.category_id, lower(btrim(p.subcategory))
     order by p.category_id, min(p.sort_order)
  loop
    sid := null;
    select id into sid from public.subcategories where category_id = r.category_id and lower(name) = r.k;
    if sid is null then
      s := public.slug_of(r.name);
      if s = '' then
        continue;
      end if;
      if exists (select 1 from public.products p where p.slug = s) or exists (select 1 from public.subcategories x where x.category_id = r.category_id and x.slug = s) then
        s := left(s, 54) || '-range';
      end if;
      insert into public.subcategories (category_id, slug, name, sort_order)
      values (r.category_id, s, left(r.name, 40), coalesce(r.first_at, 0))
      returning id into sid;
    end if;
    insert into public.product_subcategories (product_id, subcategory_id)
    select p.id, sid from public.products p
     where p.category_id = r.category_id and lower(btrim(p.subcategory)) = r.k
    on conflict do nothing;
  end loop;
end;
$$;
revoke all on function public.subcategories_from_labels() from public, anon, authenticated;

do $$ begin perform public.subcategories_from_labels(); end $$;
