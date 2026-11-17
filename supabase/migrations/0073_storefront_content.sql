-- The shop's own content, managed from the admin (Phase 2):
--   site_banners     rotating banners for the homepage (image, words, link,
--                    optional start and end dates)
--   home_sections    the homepage's blocks in order: banners, best sellers,
--                    new arrivals, a collection, a category, categories, a
--                    line of text
--   site_pages       pages and blog posts (kind 'page' / 'post'): title,
--                    body, cover, excerpt, SEO title and description
--   faqs             questions and answers, by topic
--   site_menus       links in the header and footer menus
--   page_seo         search title / description / share image for the
--                    shop's built-in pages (home, shop, a category...)
--   site_look        (one row) which storefront design the shop shows, and
--                    the announcement line at the top
--
-- Everyone can read what is switched on. Writing: the look (banners,
-- homepage sections, menus, design) by owners, admins, storefront managers
-- and front-end staff; the words (pages, blog, FAQs, SEO) by owners, admins
-- and storefront managers (staff_can, 0072).
--
-- Re-run safe. Depends on 0072.

create table if not exists public.site_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null default '' check (length(title) <= 120),
  subtitle text not null default '' check (length(subtitle) <= 240),
  image_url text not null default '' check (image_url = '' or image_url ~ '^(https://|/)'),
  link_url text not null default '' check (link_url = '' or link_url ~ '^(https://|/)'),
  button_label text not null default '' check (length(button_label) <= 40),
  tone text not null default 'gold' check (tone in ('gold', 'green', 'red', 'ink', 'paper')),
  position int not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.home_sections (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('banners', 'best_sellers', 'new_arrivals', 'collection', 'category', 'categories', 'text')),
  title text not null default '' check (length(title) <= 120),
  body text not null default '' check (length(body) <= 2000),
  ref text not null default '',
  item_count int not null default 8 check (item_count between 1 and 24),
  position int not null default 0,
  is_visible boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.site_pages (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'page' check (kind in ('page', 'post')),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 160),
  body text not null default '' check (length(body) <= 60000),
  excerpt text not null default '' check (length(excerpt) <= 400),
  cover_url text not null default '' check (cover_url = '' or cover_url ~ '^(https://|/)'),
  tags text[] not null default '{}',
  seo_title text not null default '' check (length(seo_title) <= 70),
  seo_description text not null default '' check (length(seo_description) <= 170),
  is_visible boolean not null default false,
  published_at timestamptz,
  author_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, slug)
);

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  topic text not null default 'General' check (length(topic) <= 60),
  question text not null check (length(question) between 1 and 300),
  answer text not null check (length(answer) <= 4000),
  position int not null default 0,
  is_visible boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.site_menus (
  id uuid primary key default gen_random_uuid(),
  location text not null check (location in ('header', 'footer')),
  label text not null check (length(label) between 1 and 40),
  href text not null check (href ~ '^(https://|/)'),
  position int not null default 0,
  is_visible boolean not null default true
);

create table if not exists public.page_seo (
  path text primary key check (path ~ '^/'),
  title text not null default '' check (length(title) <= 70),
  description text not null default '' check (length(description) <= 170),
  image_url text not null default '' check (image_url = '' or image_url ~ '^(https://|/)'),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_look (
  id int primary key default 1 check (id = 1),
  design text not null default 'current' check (design in ('current', 'shopfront', 'haveli', 'chai', 'courtyard')),
  announcement text not null default '' check (length(announcement) <= 160),
  announcement_link text not null default '' check (announcement_link = '' or announcement_link ~ '^(https://|/)'),
  updated_at timestamptz not null default now()
);
insert into public.site_look (id) values (1) on conflict (id) do nothing;

-- a published post gets its date the first time it's switched on
create or replace function public.site_pages_publish()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_visible and new.published_at is null then
    new.published_at := now();
  end if;
  if tg_op = 'INSERT' and new.author_id is null then
    new.author_id := (select auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists site_pages_publish on public.site_pages;
create trigger site_pages_publish before insert or update on public.site_pages
  for each row execute function public.site_pages_publish();

do $$
declare
  t text;
begin
  foreach t in array array['site_banners', 'home_sections', 'site_pages', 'faqs', 'site_look', 'page_seo'] loop
    execute format('drop trigger if exists %1$s_touch on public.%1$I', t);
    execute format('create trigger %1$s_touch before update on public.%1$I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- who reads and writes
alter table public.site_banners enable row level security;
alter table public.home_sections enable row level security;
alter table public.site_pages enable row level security;
alter table public.faqs enable row level security;
alter table public.site_menus enable row level security;
alter table public.page_seo enable row level security;
alter table public.site_look enable row level security;

drop policy if exists "read live banners" on public.site_banners;
create policy "read live banners" on public.site_banners for select to anon, authenticated
  using ((is_visible and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())) or public.staff_can('look'));
drop policy if exists "look staff write banners" on public.site_banners;
create policy "look staff write banners" on public.site_banners for all to authenticated using (public.staff_can('look')) with check (public.staff_can('look'));

drop policy if exists "read shown sections" on public.home_sections;
create policy "read shown sections" on public.home_sections for select to anon, authenticated using (is_visible or public.staff_can('look'));
drop policy if exists "look staff write sections" on public.home_sections;
create policy "look staff write sections" on public.home_sections for all to authenticated using (public.staff_can('look')) with check (public.staff_can('look'));

drop policy if exists "read shown menus" on public.site_menus;
create policy "read shown menus" on public.site_menus for select to anon, authenticated using (is_visible or public.staff_can('look'));
drop policy if exists "look staff write menus" on public.site_menus;
create policy "look staff write menus" on public.site_menus for all to authenticated using (public.staff_can('look')) with check (public.staff_can('look'));

drop policy if exists "read the look" on public.site_look;
create policy "read the look" on public.site_look for select to anon, authenticated using (true);
drop policy if exists "look staff change the look" on public.site_look;
create policy "look staff change the look" on public.site_look for update to authenticated using (public.staff_can('look')) with check (public.staff_can('look'));

drop policy if exists "read published pages" on public.site_pages;
create policy "read published pages" on public.site_pages for select to anon, authenticated using (is_visible or public.staff_can('content'));
drop policy if exists "content staff write pages" on public.site_pages;
create policy "content staff write pages" on public.site_pages for all to authenticated using (public.staff_can('content')) with check (public.staff_can('content'));

drop policy if exists "read shown faqs" on public.faqs;
create policy "read shown faqs" on public.faqs for select to anon, authenticated using (is_visible or public.staff_can('content'));
drop policy if exists "content staff write faqs" on public.faqs;
create policy "content staff write faqs" on public.faqs for all to authenticated using (public.staff_can('content')) with check (public.staff_can('content'));

drop policy if exists "read page seo" on public.page_seo;
create policy "read page seo" on public.page_seo for select to anon, authenticated using (true);
drop policy if exists "content staff write seo" on public.page_seo;
create policy "content staff write seo" on public.page_seo for all to authenticated using (public.staff_can('content')) with check (public.staff_can('content'));

revoke all on public.site_banners, public.home_sections, public.site_pages, public.faqs, public.site_menus, public.page_seo, public.site_look from anon, authenticated;
grant select on public.site_banners, public.home_sections, public.site_pages, public.faqs, public.site_menus, public.page_seo, public.site_look to anon, authenticated;
grant insert, update, delete on public.site_banners, public.home_sections, public.site_pages, public.faqs, public.site_menus, public.page_seo to authenticated;
grant update on public.site_look to authenticated;

-- a starting homepage: what the shop shows today, as sections to reorder
insert into public.home_sections (kind, title, position)
select k, t, p from (values ('banners', '', 0), ('categories', 'Shop by category', 1), ('best_sellers', 'Best sellers', 2), ('new_arrivals', 'New arrivals', 3)) v(k, t, p)
where not exists (select 1 from public.home_sections);

-- banner pictures: uploaded beside the product photos, under banners/, by
-- anyone who looks after the look
drop policy if exists "look staff add banner photos" on storage.objects;
create policy "look staff add banner photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos' and name like 'banners/%' and public.staff_can('look'));
drop policy if exists "look staff remove banner photos" on storage.objects;
create policy "look staff remove banner photos" on storage.objects for delete to authenticated
  using (bucket_id = 'product-photos' and name like 'banners/%' and public.staff_can('look'));

-- the homepage's best sellers: shown products, most units sold lately first.
-- Only the order is given out, never the numbers.
create or replace function public.shop_best_sellers(p_days int default 60, p_limit int default 12)
returns table (slug text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.slug
    from public.order_items i
    join public.orders o on o.id = i.order_id
    join public.product_variants v on v.id = i.variant_id
    join public.products p on p.id = v.product_id
   where o.created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 60), 7), 365))
     and o.status not in ('cancelled', 'pending') and not o.is_test and p.is_visible
   group by p.slug
   order by sum(i.quantity) desc, p.slug
   limit least(greatest(coalesce(p_limit, 12), 1), 24);
$$;
revoke all on function public.shop_best_sellers(int, int) from public;
grant execute on function public.shop_best_sellers(int, int) to anon, authenticated;
