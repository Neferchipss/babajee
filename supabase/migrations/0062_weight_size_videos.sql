-- Weight, size and videos.
--
-- 1. Each option (a box too: it weighs what its pieces do and more) can have
--    its packed weight in grams and its size in centimetres (length x width x
--    height), for shipping and for the product page. Empty when not known.
-- 2. A product can have videos: links (YouTube, or a direct .mp4), shown on
--    its page. Links rather than uploads: video files would soon fill the
--    project's storage.
--
-- Re-run safe.

alter table public.product_variants add column if not exists weight_g numeric(10, 1);
alter table public.product_variants add column if not exists length_cm numeric(8, 1);
alter table public.product_variants add column if not exists width_cm numeric(8, 1);
alter table public.product_variants add column if not exists height_cm numeric(8, 1);
alter table public.product_variants drop constraint if exists product_variants_size_check;
alter table public.product_variants add constraint product_variants_size_check check (
  (weight_g is null or weight_g > 0) and (length_cm is null or length_cm > 0)
  and (width_cm is null or width_cm > 0) and (height_cm is null or height_cm > 0));

alter table public.products add column if not exists video_urls text[] not null default '{}';
alter table public.products drop constraint if exists products_video_urls_check;
-- at most six, each a plain https:// address (no spaces, nothing else)
alter table public.products add constraint products_video_urls_check check (
  cardinality(video_urls) <= 6
  and (cardinality(video_urls) = 0
       or array_to_string(video_urls, chr(10)) ~ ('^https://[^[:space:]]+(' || chr(10) || 'https://[^[:space:]]+)*$')));
