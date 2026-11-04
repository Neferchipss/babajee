-- Search-engine listing per product: the title and description Google (and
-- link previews on WhatsApp, Instagram) show. Optional: left empty, the shop
-- writes them from the product's name, category and description
-- (src/lib/seo.ts). Read by the build, so a change shows after the next
-- deploy. Safe to re-run.

alter table public.products add column if not exists seo_title text not null default '';
alter table public.products add column if not exists seo_description text not null default '';

alter table public.products drop constraint if exists products_seo_title_len;
alter table public.products add constraint products_seo_title_len check (char_length(seo_title) <= 120);
alter table public.products drop constraint if exists products_seo_description_len;
alter table public.products add constraint products_seo_description_len check (char_length(seo_description) <= 320);
