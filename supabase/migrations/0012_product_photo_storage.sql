-- Product photos uploaded from the admin's Products page.
--
-- The files go in a public Storage bucket, `product-photos` (anyone can view a
-- photo, as on any shop); only an admin can add, replace or remove one. Each
-- file has a row in public.product_images (made in 0003_catalogue.sql): its
-- product, optionally the option it shows (variant_id), and its order.
--
-- Safe to re-run. Run it once in the Supabase SQL editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 8388608, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "read product photos" on storage.objects;
create policy "read product photos" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'product-photos');

drop policy if exists "admins add product photos" on storage.objects;
create policy "admins add product photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-photos' and public.is_admin());

drop policy if exists "admins change product photos" on storage.objects;
create policy "admins change product photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-photos' and public.is_admin())
  with check (bucket_id = 'product-photos' and public.is_admin());

drop policy if exists "admins remove product photos" on storage.objects;
create policy "admins remove product photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-photos' and public.is_admin());

-- the shop reads a product's photos in order
create index if not exists product_images_order_idx on public.product_images (product_id, sort_order);

-- Verify (should list the bucket as public, and four policies):
-- select id, public from storage.buckets where id = 'product-photos';
-- select policyname from pg_policies where tablename = 'objects' and policyname like '%product photos%';
