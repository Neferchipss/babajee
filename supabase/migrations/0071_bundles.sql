-- Bundles (combo packs): an option made of other products' options, e.g. a
-- "Starter kit" = 1 grinder + 2 packs of papers + 1 tray, with its own price.
--
-- 1. bundle_items(bundle_variant_id, component_variant_id, qty): what one of
--    the bundle holds. A component is a loose option (not a box, not another
--    bundle) of any other product.
-- 2. A bundle holds no stock of its own: its stock_qty is how many can be
--    made from its components (the smallest components' stock / qty), and it
--    counts stock when any component does. Selling one takes each component
--    x its qty; cancelling or restocking puts them back, through the usual
--    stock paths (the same trick as boxes, 0061). Stock history stays on the
--    components.
-- 3. A bundle's cost is the sum of its components' costs x qty, kept in step,
--    so its profit is right.
-- 4. The shop can read what a shown bundle holds ("Includes").
--
-- Re-run safe. Needs 0061 (boxes) and 0057/0059 (costs).

create table if not exists public.bundle_items (
  bundle_variant_id uuid not null references public.product_variants (id) on delete cascade,
  component_variant_id uuid not null references public.product_variants (id) on delete restrict,
  qty int not null default 1 check (qty between 1 and 100),
  position int not null default 0,
  primary key (bundle_variant_id, component_variant_id),
  check (bundle_variant_id <> component_variant_id)
);
create index if not exists bundle_items_component_idx on public.bundle_items (component_variant_id);

alter table public.bundle_items enable row level security;
drop policy if exists "read bundles of shown products" on public.bundle_items;
create policy "read bundles of shown products" on public.bundle_items for select to anon, authenticated
  using (exists (select 1 from public.product_variants v join public.products p on p.id = v.product_id
                  where v.id = bundle_variant_id and v.is_visible and p.is_visible));
drop policy if exists "admins read bundles" on public.bundle_items;
create policy "admins read bundles" on public.bundle_items for select to authenticated using (public.is_admin());
drop policy if exists "admins write bundles" on public.bundle_items;
create policy "admins write bundles" on public.bundle_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.bundle_items from anon, authenticated;
grant select on public.bundle_items to anon, authenticated;
grant insert, update, delete on public.bundle_items to authenticated;

create or replace function public.is_bundle(p_variant uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.bundle_items where bundle_variant_id = p_variant);
$$;

-- how many of a bundle its components make, and whether it counts stock
create or replace function public.bundle_stock(p_bundle uuid, out qty int, out tracked boolean)
language sql
stable
set search_path = ''
as $$
  select coalesce(min(floor(v.stock_qty::numeric / b.qty)) filter (where v.track_stock), 0)::int,
         coalesce(bool_or(v.track_stock), false)
    from public.bundle_items b join public.product_variants v on v.id = b.component_variant_id
   where b.bundle_variant_id = p_bundle;
$$;

-- ---------------------------------------------------------------- rules for a component
create or replace function public.bundle_items_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  b record;
begin
  select v.id, v.product_id, v.unit_variant_id into c from public.product_variants v where v.id = new.component_variant_id;
  select v.id, v.product_id, v.unit_variant_id into b from public.product_variants v where v.id = new.bundle_variant_id;
  if c.unit_variant_id is not null then
    raise exception 'A bundle holds loose options, not boxes.' using errcode = '22023';
  end if;
  if public.is_bundle(new.component_variant_id) then
    raise exception 'A bundle can''t hold another bundle.' using errcode = '22023';
  end if;
  if b.unit_variant_id is not null then
    raise exception 'A box can''t be a bundle.' using errcode = '22023';
  end if;
  if c.product_id = b.product_id then
    raise exception 'A bundle holds other products.' using errcode = '22023';
  end if;
  if exists (select 1 from public.bundle_items where component_variant_id = new.bundle_variant_id) then
    raise exception 'That option is already inside a bundle, so it can''t be one.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.bundle_items_rules() from public, anon, authenticated;
drop trigger if exists bundle_items_rules on public.bundle_items;
create trigger bundle_items_rules before insert or update on public.bundle_items
  for each row execute function public.bundle_items_rules();

-- ---------------------------------------------------------------- stock
-- bring one bundle's stock and cost in step with its components
create or replace function public.bundle_refresh(p_bundle uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
begin
  if not public.is_bundle(p_bundle) then
    return;
  end if;
  s := public.bundle_stock(p_bundle);
  perform set_config('babajee.bundle_sync', '1', true);
  update public.product_variants set stock_qty = s.qty, track_stock = s.tracked
   where id = p_bundle and (stock_qty is distinct from s.qty or track_stock is distinct from s.tracked);
  perform set_config('babajee.bundle_sync', '', true);
  -- cost: the components' x qty (only when every component has one)
  if exists (select 1 from public.bundle_items b left join public.variant_costs vc on vc.variant_id = b.component_variant_id
              where b.bundle_variant_id = p_bundle and vc.variant_id is null) then
    delete from public.variant_costs where variant_id = p_bundle;
  else
    insert into public.variant_costs (variant_id, cost, purchase, gst_paid, gst_claimable)
    select p_bundle, round(sum(vc.cost * b.qty), 2), round(sum(coalesce(vc.purchase, vc.cost) * b.qty), 2), round(sum(coalesce(vc.gst_paid, 0) * b.qty), 2), round(sum(coalesce(vc.gst_claimable, 0) * b.qty), 2)
      from public.bundle_items b join public.variant_costs vc on vc.variant_id = b.component_variant_id
     where b.bundle_variant_id = p_bundle
    on conflict (variant_id) do update
      set cost = excluded.cost, purchase = excluded.purchase, gst_paid = excluded.gst_paid, gst_claimable = excluded.gst_claimable;
  end if;
end;
$$;
revoke all on function public.bundle_refresh(uuid) from public, anon, authenticated;

-- a bundle's stock changed (a sale, cancel, restock): the same change on
-- each component x qty; the bundle then reads its components again
create or replace function public.product_variants_bundle_redirect()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
begin
  if coalesce(current_setting('babajee.bundle_sync', true), '') = '1' or not public.is_bundle(new.id) then
    return new;
  end if;
  if new.stock_qty is distinct from old.stock_qty then
    -- the components' own sync leaves this bundle alone: it sets itself below
    perform set_config('babajee.bundle_skip', new.id::text, true);
    update public.product_variants v set stock_qty = v.stock_qty + (new.stock_qty - old.stock_qty) * b.qty
      from public.bundle_items b
     where b.bundle_variant_id = new.id and v.id = b.component_variant_id;
    perform set_config('babajee.bundle_skip', '', true);
  end if;
  s := public.bundle_stock(new.id);
  new.stock_qty := s.qty;
  new.track_stock := s.tracked;
  return new;
end;
$$;
revoke all on function public.product_variants_bundle_redirect() from public, anon, authenticated;
drop trigger if exists product_variants_bundle_redirect on public.product_variants;
create trigger product_variants_bundle_redirect
  before update of stock_qty, track_stock on public.product_variants
  for each row execute function public.product_variants_bundle_redirect();

-- a component's stock or counting changed: the bundles holding it follow
create or replace function public.product_variants_bundle_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b uuid;
  s record;
  skip text := coalesce(current_setting('babajee.bundle_skip', true), '');
begin
  if new.stock_qty is distinct from old.stock_qty or new.track_stock is distinct from old.track_stock then
    for b in select distinct bundle_variant_id from public.bundle_items where component_variant_id = new.id and (skip = '' or bundle_variant_id <> skip::uuid) loop
      s := public.bundle_stock(b);
      perform set_config('babajee.bundle_sync', '1', true);
      update public.product_variants set stock_qty = s.qty, track_stock = s.tracked
       where id = b and (stock_qty is distinct from s.qty or track_stock is distinct from s.tracked);
      perform set_config('babajee.bundle_sync', '', true);
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function public.product_variants_bundle_sync() from public, anon, authenticated;
drop trigger if exists product_variants_bundle_sync on public.product_variants;
create trigger product_variants_bundle_sync
  after update of stock_qty, track_stock on public.product_variants
  for each row execute function public.product_variants_bundle_sync();

-- what a bundle holds changed: its stock and cost again
create or replace function public.bundle_items_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b uuid := coalesce(new.bundle_variant_id, old.bundle_variant_id);
  s record;
begin
  if public.is_bundle(b) then
    perform public.bundle_refresh(b);
  else
    -- the last component taken out: an ordinary option again, out of stock
    delete from public.variant_costs where variant_id = b;
    perform set_config('babajee.bundle_sync', '1', true);
    update public.product_variants set stock_qty = 0 where id = b and stock_qty <> 0;
    perform set_config('babajee.bundle_sync', '', true);
  end if;
  return null;
end;
$$;
revoke all on function public.bundle_items_follow() from public, anon, authenticated;
drop trigger if exists bundle_items_follow on public.bundle_items;
create trigger bundle_items_follow after insert or update or delete on public.bundle_items
  for each row execute function public.bundle_items_follow();

-- a component's cost changed: the bundles holding it follow
create or replace function public.variant_costs_bundle_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  vid uuid := coalesce(new.variant_id, old.variant_id);
  b uuid;
begin
  for b in select distinct bundle_variant_id from public.bundle_items where component_variant_id = vid loop
    perform public.bundle_refresh(b);
  end loop;
  return null;
end;
$$;
revoke all on function public.variant_costs_bundle_follow() from public, anon, authenticated;
drop trigger if exists variant_costs_bundle_follow on public.variant_costs;
create trigger variant_costs_bundle_follow after insert or update or delete on public.variant_costs
  for each row execute function public.variant_costs_bundle_follow();

-- stock history stays on the components (and a box's on its loose option, 0061)
create or replace function public.log_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unit_variant_id is not null or public.is_bundle(new.id) then
    return new;
  end if;
  if new.stock_qty is distinct from old.stock_qty then
    insert into public.stock_movements (variant_id, delta, qty_after, reason, order_id, receipt_id, note, actor_id, created_at)
    values (
      new.id,
      new.stock_qty - old.stock_qty,
      new.stock_qty,
      coalesce(nullif(current_setting('babajee.stock_reason', true), ''), 'manual'),
      nullif(current_setting('babajee.order_id', true), '')::uuid,
      nullif(current_setting('babajee.receipt_id', true), '')::uuid,
      coalesce(current_setting('babajee.stock_note', true), ''),
      (select auth.uid()),
      clock_timestamp()
    );
  end if;
  return new;
end;
$$;

-- a bundle's buying price is its components': correct those instead
create or replace function public.purchase_corrections_not_box()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.product_variants where id = new.variant_id and unit_variant_id is not null) then
    raise exception 'A box''s buying price follows its pieces: correct the loose option''s price instead.' using errcode = '22023';
  end if;
  if public.is_bundle(new.variant_id) then
    raise exception 'A bundle''s buying price is its products'': correct those instead.' using errcode = '22023';
  end if;
  return new;
end;
$$;
