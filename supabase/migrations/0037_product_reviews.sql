-- Product reviews and ratings.
--
-- 1. product_reviews: one per customer and product, 1 to 5 stars with an
--    optional title and text. Only someone who bought the product and had it
--    delivered can write one (submit_review checks). New and edited reviews
--    wait for the shop: pending, then approved or hidden.
-- 2. Anyone (signed in or not) reads approved reviews; customers read their
--    own whatever the status; admins read and moderate all.
-- 3. author is how the review is signed, "Taha S.", set from the profile at
--    writing time, so the shop never shows a customer's full name or account.
-- Depends on 0001, 0003, 0004. Safe to re-run.

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_slug text not null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  title text not null default '',
  body text not null default '',
  author text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, product_slug)
);
create index if not exists product_reviews_slug on public.product_reviews (product_slug, status);

drop trigger if exists product_reviews_touch on public.product_reviews;
create trigger product_reviews_touch
  before update on public.product_reviews
  for each row execute function public.touch_updated_at();

alter table public.product_reviews enable row level security;

drop policy if exists "read approved reviews" on public.product_reviews;
create policy "read approved reviews" on public.product_reviews
  for select to anon, authenticated
  using (status = 'approved');

drop policy if exists "read own reviews" on public.product_reviews;
create policy "read own reviews" on public.product_reviews
  for select to authenticated
  using ((select auth.uid()) = profile_id);

drop policy if exists "delete own reviews" on public.product_reviews;
create policy "delete own reviews" on public.product_reviews
  for delete to authenticated
  using ((select auth.uid()) = profile_id);

drop policy if exists "admins manage reviews" on public.product_reviews;
create policy "admins manage reviews" on public.product_reviews
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.product_reviews from anon, public;
grant select on public.product_reviews to anon;
grant select, delete, update on public.product_reviews to authenticated;

-- write or edit one's review: only for a product delivered to them; it goes
-- back to waiting for the shop each time it changes
create or replace function public.submit_review(p_slug text, p_rating int, p_title text, p_body text)
returns public.product_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  name text;
  r public.product_reviews;
begin
  if me is null then
    raise exception 'Sign in to write a review.' using errcode = '42501';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Pick from 1 to 5 stars.' using errcode = '22023';
  end if;
  if not exists (
    select 1
      from public.order_items i
      join public.orders o on o.id = i.order_id and o.profile_id = me and o.status = 'delivered'
      join public.product_variants v on v.id = i.variant_id
      join public.products p on p.id = v.product_id and p.slug = p_slug
  ) then
    raise exception 'You can review a product once it has been delivered to you.' using errcode = '42501';
  end if;
  select trim(full_name) into name from public.profiles where id = me;
  name := coalesce(nullif(name, ''), 'A customer');
  if position(' ' in name) > 0 then
    name := split_part(name, ' ', 1) || ' ' || left(split_part(name, ' ', array_length(string_to_array(name, ' '), 1)), 1) || '.';
  end if;
  insert into public.product_reviews (product_slug, profile_id, rating, title, body, author, status)
  values (p_slug, me, p_rating, left(coalesce(trim(p_title), ''), 120), left(coalesce(trim(p_body), ''), 2000), name, 'pending')
  on conflict (profile_id, product_slug) do update
    set rating = excluded.rating, title = excluded.title, body = excluded.body, author = excluded.author, status = 'pending'
  returning * into r;
  return r;
end;
$$;

revoke all on function public.submit_review(text, int, text, text) from public, anon;
grant execute on function public.submit_review(text, int, text, text) to authenticated;
