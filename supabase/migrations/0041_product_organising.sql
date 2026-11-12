-- Organising products: status, subcategories, specifications, collections.
--
-- 1. products.status: 'draft' (being prepared, not on the shop), 'published'
--    (on the shop) or 'archived' (retired: off the shop and out of the
--    admin's everyday list, kept for its orders and history). is_visible
--    stays what the shop's rules read (0003), kept in step by a trigger
--    either way round, so older screens that flip is_visible still work.
-- 2. products.subcategory: a short label within the product's category
--    ("Cones", "Filters"); the shelf shows them as filter chips.
-- 3. products.specs: a list of {label, value} rows ("Material": "Aluminium"),
--    shown as a table on the product page.
-- 4. collections + collection_items: hand-picked, ordered lists of products
--    ("Staff picks", "Gift ideas"), each with its own shelf on the shop.
-- Depends on 0001, 0003. Safe to re-run.

-- ---------------------------------------------------------------- 1. status
alter table public.products add column if not exists status text not null default 'published';
alter table public.products drop constraint if exists products_status_check;
alter table public.products add constraint products_status_check check (status in ('draft', 'published', 'archived'));
-- what's hidden today becomes a draft
update public.products set status = 'draft' where not is_visible and status = 'published';

create or replace function public.products_status_sync()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'published' and not new.is_visible then
      new.status := 'draft';
    end if;
  elsif new.status is distinct from old.status then
    null; -- status chosen: is_visible follows below
  elsif new.is_visible is distinct from old.is_visible then
    new.status := case when new.is_visible then 'published' when old.status = 'archived' then 'archived' else 'draft' end;
  end if;
  new.is_visible := new.status = 'published';
  return new;
end;
$$;
drop trigger if exists products_status_sync on public.products;
create trigger products_status_sync
  before insert or update of status, is_visible on public.products
  for each row execute function public.products_status_sync();

-- ---------------------------------------------------------------- 2, 3
alter table public.products add column if not exists subcategory text not null default '';
alter table public.products add column if not exists specs jsonb not null default '[]';
alter table public.products drop constraint if exists products_specs_list;
alter table public.products add constraint products_specs_list check (jsonb_typeof(specs) = 'array');

-- ---------------------------------------------------------------- 4. collections
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  tagline text not null default '',
  sort_order int not null default 0,
  is_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists collections_touch on public.collections;
create trigger collections_touch
  before update on public.collections
  for each row execute function public.touch_updated_at();

create table if not exists public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  position int not null default 0,
  primary key (collection_id, product_id)
);
create index if not exists collection_items_product on public.collection_items (product_id);

alter table public.collections enable row level security;
alter table public.collection_items enable row level security;

drop policy if exists "read shown collections" on public.collections;
create policy "read shown collections" on public.collections
  for select to anon, authenticated using (is_visible or public.is_admin());
drop policy if exists "admins manage collections" on public.collections;
create policy "admins manage collections" on public.collections
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read shown collection items" on public.collection_items;
create policy "read shown collection items" on public.collection_items
  for select to anon, authenticated
  using (public.is_admin() or exists (select 1 from public.collections c where c.id = collection_id and c.is_visible));
drop policy if exists "admins manage collection items" on public.collection_items;
create policy "admins manage collection items" on public.collection_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.collections, public.collection_items from anon, authenticated, public;
grant select on public.collections, public.collection_items to anon;
grant select, insert, update, delete on public.collections, public.collection_items to authenticated;
