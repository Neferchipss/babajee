-- Rule-based collections: a collection can fill itself from rules ("Bongs
-- under ₹2,000", "New in the last 30 days", "Glass, in stock") instead of
-- being hand-picked. Its products are worked out again whenever a product,
-- price, stock or tag changes, when the collection is saved, and every night
-- (for "new in" and "best sellers", which move with time). The shop reads
-- collection_items as before (0041), so nothing on the shop changes.
--
-- collections.mode: 'manual' (hand-picked, as before) or 'auto'.
-- collections.rules: [{ "field": ..., "op": ..., "value": ... }], fields:
--   category   op "is" / "is_not"   value: category slug
--   tag        op "is"              value: sub-category id (0063)
--   brand      op "is" / "contains" value: text
--   name       op "contains" / "not_contains"
--   price      op "under" / "over"  value: rupees (lowest option price)
--   in_stock   op "is"              value: true (some option has stock, or doesn't count it)
--   on_sale    op "is"              value: true (a compare-at price above the price)
--   new_days   op "within"          value: days since the product was added
--   sold_days  op "within"          value: days; sold at least once in that time
-- collections.match: 'all' rules or 'any'. collections.sort: 'manual',
-- 'best_selling' (units, last 90 days), 'newest', 'price_asc', 'price_desc',
-- 'name'. collections.max_items: at most this many (null: no limit).
--
-- Re-run safe. Depends on 0041, 0063.

alter table public.collections add column if not exists mode text not null default 'manual';
alter table public.collections add column if not exists rules jsonb not null default '[]';
alter table public.collections add column if not exists match text not null default 'all';
alter table public.collections add column if not exists sort text not null default 'best_selling';
alter table public.collections add column if not exists max_items int;
alter table public.collections drop constraint if exists collections_auto_check;
alter table public.collections add constraint collections_auto_check check (
  mode in ('manual', 'auto') and match in ('all', 'any') and jsonb_typeof(rules) = 'array'
  and sort in ('manual', 'best_selling', 'newest', 'price_asc', 'price_desc', 'name')
  and (max_items is null or max_items between 1 and 500));

-- does one product meet one rule
create or replace function public.collection_rule_ok(p_product uuid, r jsonb)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  f text := r ->> 'field';
  op text := coalesce(r ->> 'op', 'is');
  v text := r ->> 'value';
  p record;
  low numeric;
begin
  select pr.*, c.slug as category_slug into p from public.products pr join public.categories c on c.id = pr.category_id where pr.id = p_product;
  if p.id is null then return false; end if;
  if f = 'category' then
    return case when op = 'is_not' then p.category_slug <> v else p.category_slug = v end;
  elsif f = 'tag' then
    return exists (select 1 from public.product_subcategories ps where ps.product_id = p_product and ps.subcategory_id::text = v);
  elsif f = 'brand' then
    return case when op = 'contains' then p.brand ilike '%' || v || '%' else lower(btrim(p.brand)) = lower(btrim(v)) end;
  elsif f = 'name' then
    return case when op = 'not_contains' then p.name not ilike '%' || v || '%' else p.name ilike '%' || v || '%' end;
  elsif f = 'price' then
    select min(pv.price) into low from public.product_variants pv where pv.product_id = p_product and pv.is_visible and pv.unit_variant_id is null;
    return low is not null and case when op = 'over' then low > v::numeric else low < v::numeric end;
  elsif f = 'in_stock' then
    return exists (select 1 from public.product_variants pv where pv.product_id = p_product and pv.is_visible and (not pv.track_stock or pv.stock_qty > 0));
  elsif f = 'on_sale' then
    return exists (select 1 from public.product_variants pv where pv.product_id = p_product and pv.is_visible and pv.compare_at > pv.price);
  elsif f = 'new_days' then
    return p.created_at >= now() - make_interval(days => v::int);
  elsif f = 'sold_days' then
    return exists (select 1 from public.order_items i join public.orders o on o.id = i.order_id join public.product_variants pv on pv.id = i.variant_id
                    where pv.product_id = p_product and o.created_at >= now() - make_interval(days => v::int) and o.status not in ('cancelled', 'pending') and not o.is_test);
  end if;
  return false;
end;
$$;

-- work out one auto collection's products again
create or replace function public.refresh_collection(p_collection uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  n int;
begin
  select * into c from public.collections where id = p_collection;
  if c.id is null or c.mode <> 'auto' then return 0; end if;
  delete from public.collection_items where collection_id = c.id;
  if jsonb_array_length(c.rules) = 0 then return 0; end if;
  insert into public.collection_items (collection_id, product_id, position)
  select c.id, x.id, (row_number() over (order by x.k1 desc nulls last, x.k2, x.name) - 1)::int
    from (
      select p.id, p.name,
             case c.sort
               when 'best_selling' then (select coalesce(sum(i.quantity), 0) from public.order_items i join public.orders o on o.id = i.order_id join public.product_variants pv on pv.id = i.variant_id
                                          where pv.product_id = p.id and o.created_at >= now() - interval '90 days' and o.status not in ('cancelled', 'pending') and not o.is_test)
               when 'newest' then extract(epoch from p.created_at)
               when 'price_desc' then (select min(pv.price) from public.product_variants pv where pv.product_id = p.id and pv.is_visible and pv.unit_variant_id is null)
               when 'manual' then -p.sort_order
               else null
             end as k1,
             case c.sort when 'price_asc' then (select min(pv.price) from public.product_variants pv where pv.product_id = p.id and pv.is_visible and pv.unit_variant_id is null) else null end as k2
        from public.products p
       where p.status = 'published'
         and case when c.match = 'any'
                  then exists (select 1 from jsonb_array_elements(c.rules) r where public.collection_rule_ok(p.id, r))
                  else not exists (select 1 from jsonb_array_elements(c.rules) r where not public.collection_rule_ok(p.id, r)) end
       order by 3 desc nulls last, 4, p.name
       limit coalesce(c.max_items, 500)
    ) x;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.refresh_collection(uuid) from public, anon, authenticated;

create or replace function public.refresh_auto_collections()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  c uuid;
  n int := 0;
begin
  for c in select id from public.collections where mode = 'auto' loop
    n := n + public.refresh_collection(c);
  end loop;
  return n;
end;
$$;
revoke all on function public.refresh_auto_collections() from public, anon, authenticated;

-- the admin's "Refresh now" and after saving the rules
create or replace function public.admin_refresh_collection(p_collection uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return public.refresh_collection(p_collection);
end;
$$;
revoke all on function public.admin_refresh_collection(uuid) from public, anon;
grant execute on function public.admin_refresh_collection(uuid) to authenticated;

-- a saved auto collection fills at once
create or replace function public.collections_auto_fill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mode = 'auto' and (tg_op = 'INSERT' or new.rules is distinct from old.rules or new.match is distinct from old.match
      or new.sort is distinct from old.sort or new.max_items is distinct from old.max_items or new.mode is distinct from old.mode) then
    perform public.refresh_collection(new.id);
  end if;
  return null;
end;
$$;
revoke all on function public.collections_auto_fill() from public, anon, authenticated;
drop trigger if exists collections_auto_fill on public.collections;
create trigger collections_auto_fill after insert or update on public.collections
  for each row execute function public.collections_auto_fill();

-- a product, price, stock or tag change: auto collections again (once per
-- statement). A failure here never stops the product being saved.
create or replace function public.collections_follow_products()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.collections where mode = 'auto') then
    begin
      perform public.refresh_auto_collections();
    exception when others then
      raise warning 'auto collections not refreshed: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;
revoke all on function public.collections_follow_products() from public, anon, authenticated;
drop trigger if exists collections_follow_products on public.products;
create trigger collections_follow_products after insert or update or delete on public.products
  for each statement execute function public.collections_follow_products();
drop trigger if exists collections_follow_variants on public.product_variants;
create trigger collections_follow_variants after insert or update of price, compare_at, stock_qty, track_stock, is_visible or delete on public.product_variants
  for each statement execute function public.collections_follow_products();
drop trigger if exists collections_follow_tags on public.product_subcategories;
create trigger collections_follow_tags after insert or delete on public.product_subcategories
  for each statement execute function public.collections_follow_products();

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('babajee-auto-collections', '50 18 * * *', 'select public.refresh_auto_collections()');
  end if;
end $$;
