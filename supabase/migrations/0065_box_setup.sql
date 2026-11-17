-- Box setup per product, and presets.
--
-- 0061 made boxes: an option of its own, holding so many of a loose option.
-- Here a product keeps its box sizes (product_box_sizes): set once on the
-- product ("Box of 24", "Box of 50"), each with the box's usual price. Each
-- loose option (a colour, a size) then ticks which of them it comes in: the
-- red in 50s, the blue in 24s; ticking one makes that option's box (0061),
-- priced from the product's size until it's given its own.
--
-- Presets (box_presets): a named set of sizes, saved from a product and put
-- on others, or on a whole category, in one go (admin_apply_box_preset).
--
-- Re-run safe. Needs 0061.

create table if not exists public.product_box_sizes (
  product_id uuid not null references public.products (id) on delete cascade,
  pieces int not null check (pieces > 1 and pieces <= 100000),
  -- what a box of this size sells for, unless an option's box says otherwise
  price numeric(10, 2) check (price is null or price >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  primary key (product_id, pieces)
);

create table if not exists public.box_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '' and length(name) <= 60),
  sizes int[] not null check (cardinality(sizes) between 1 and 12 and 1 < all (sizes)),
  created_at timestamptz not null default now()
);
create unique index if not exists box_presets_name_idx on public.box_presets (lower(name));

do $$
declare
  t text;
begin
  foreach t in array array['product_box_sizes', 'box_presets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admins manage" on public.%I', t);
    execute format('create policy "admins manage" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('revoke all on public.%I from anon, authenticated, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop trigger if exists audit_row on public.%I', t);
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- a preset's sizes onto products (a list, or every product in a category);
-- sizes a product already has are left as they are. Returns sizes added.
create or replace function public.admin_apply_box_preset(p_preset uuid, p_products uuid[] default null, p_category uuid default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr record;
  n int;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  select * into pr from public.box_presets where id = p_preset;
  if not found then
    raise exception 'Preset not found.' using errcode = 'P0002';
  end if;
  if p_products is null and p_category is null then
    raise exception 'Say which products, or which category.' using errcode = '22023';
  end if;
  insert into public.product_box_sizes (product_id, pieces, sort_order)
  select p.id, s.pieces, s.ord
    from public.products p
    cross join unnest(pr.sizes) with ordinality as s(pieces, ord)
   where (p_products is not null and p.id = any (p_products))
      or (p_category is not null and p.category_id = p_category)
  on conflict (product_id, pieces) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.admin_apply_box_preset(uuid, uuid[], uuid) from public, anon;
grant execute on function public.admin_apply_box_preset(uuid, uuid[], uuid) to authenticated;

-- boxes already made (0061) bring their sizes onto their products
insert into public.product_box_sizes (product_id, pieces)
select distinct b.product_id, b.pack_of
  from public.product_variants b where b.unit_variant_id is not null
on conflict do nothing;
