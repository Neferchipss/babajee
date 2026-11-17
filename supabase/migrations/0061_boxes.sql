-- Boxes: products bought in boxes and sold in pieces, or in whole boxes.
--
-- A category can be marked "sold in boxes" (categories.sold_in_boxes); its
-- products then show their boxes in the admin. A box is an option of its own
-- (a product_variants row, e.g. "Box of 50") tied to the loose option it
-- holds (unit_variant_id) and how many pieces it holds (pack_of). It has its
-- own selling price, typed separately, and is on sale only when ticked
-- (is_visible: "can sell to customers").
--
-- A box holds no stock of its own. Its stock_qty is always the loose
-- option's pieces / pack_of, rounded down. Anything that changes a box's
-- stock (a sale, a cancel, a refund restock, a supplier bill, a void) is
-- turned into the same change in pieces on the loose option, so every path
-- that already moves stock works on boxes unchanged:
--   selling 1 "Box of 50" takes 50 pieces; restocking it puts 50 back.
-- Stock history is kept on the loose option only.
--
-- A supplier bill can take boxes: the line stays as billed (boxes at the box
-- price, its GST to the paisa), the stock and the average buying price move
-- on the loose option, per piece. A box's cost is its loose option's cost x
-- pack_of, kept in step, so box sales get the right profit.
--
-- Each product's box sizes, and presets of them, are in 0065.
--
-- 1. columns and templates   2. a box's own rules   3. stock follows pieces
-- 4. cost follows pieces     5. bills, voids, counts  6. lists and reports
--
-- Re-run safe. Needs 0057 and 0059.

-- ---------------------------------------------------------------- 1. columns and templates

alter table public.categories add column if not exists sold_in_boxes boolean not null default false;

alter table public.product_variants add column if not exists pack_of int not null default 1;
alter table public.product_variants add column if not exists unit_variant_id uuid references public.product_variants (id) on delete cascade;
alter table public.product_variants drop constraint if exists product_variants_box_check;
alter table public.product_variants add constraint product_variants_box_check
  check ((unit_variant_id is null and pack_of = 1) or (unit_variant_id is not null and pack_of > 1));
create index if not exists product_variants_unit_idx on public.product_variants (unit_variant_id) where unit_variant_id is not null;

-- ---------------------------------------------------------------- 2. a box's own rules

-- a box holds a loose option of the same product (never another box); it
-- starts with that option's stock in boxes and counts when it counts
create or replace function public.product_variants_box_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
begin
  if new.unit_variant_id is null then
    return new;
  end if;
  select pv.id, pv.product_id, pv.unit_variant_id, pv.stock_qty, pv.track_stock into u
    from public.product_variants pv where pv.id = new.unit_variant_id;
  if u.id is null or u.product_id <> new.product_id then
    raise exception 'A box holds an option of its own product.' using errcode = '22023';
  end if;
  if u.unit_variant_id is not null then
    raise exception 'A box holds loose pieces, not another box.' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' or new.unit_variant_id is distinct from old.unit_variant_id or new.pack_of is distinct from old.pack_of then
    new.stock_qty := floor(u.stock_qty::numeric / new.pack_of);
    new.track_stock := u.track_stock;
  end if;
  return new;
end;
$$;
revoke all on function public.product_variants_box_rules() from public, anon, authenticated;
drop trigger if exists product_variants_box_rules on public.product_variants;
create trigger product_variants_box_rules
  before insert or update of unit_variant_id, pack_of on public.product_variants
  for each row execute function public.product_variants_box_rules();

-- ---------------------------------------------------------------- 3. stock follows pieces

-- A box's stock changed: the same change, in pieces, on its loose option;
-- the box then reads the loose option's pieces / pack_of. Its counting
-- follows the loose option too. (While boxes are being brought in step,
-- babajee.box_sync is set and nothing is redirected.)
create or replace function public.product_variants_box_redirect()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
begin
  if new.unit_variant_id is null or coalesce(current_setting('babajee.box_sync', true), '') = '1' then
    return new;
  end if;
  if new.stock_qty is distinct from old.stock_qty then
    perform set_config('babajee.box_skip', new.id::text, true);
    update public.product_variants set stock_qty = stock_qty + (new.stock_qty - old.stock_qty) * new.pack_of
     where id = new.unit_variant_id;
    perform set_config('babajee.box_skip', '', true);
  end if;
  select pv.stock_qty, pv.track_stock into u from public.product_variants pv where pv.id = new.unit_variant_id;
  new.stock_qty := floor(u.stock_qty::numeric / new.pack_of);
  new.track_stock := u.track_stock;
  return new;
end;
$$;
revoke all on function public.product_variants_box_redirect() from public, anon, authenticated;
drop trigger if exists product_variants_box_redirect on public.product_variants;
create trigger product_variants_box_redirect
  before update of stock_qty, track_stock on public.product_variants
  for each row execute function public.product_variants_box_redirect();

-- A loose option's stock or counting changed: its boxes follow (all but the
-- box whose own change started it: that one sets itself)
create or replace function public.product_variants_box_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  skip text := coalesce(current_setting('babajee.box_skip', true), '');
begin
  if new.unit_variant_id is not null then
    return null;
  end if;
  if new.stock_qty is distinct from old.stock_qty or new.track_stock is distinct from old.track_stock then
    perform set_config('babajee.box_sync', '1', true);
    update public.product_variants b
       set stock_qty = floor(new.stock_qty::numeric / b.pack_of), track_stock = new.track_stock
     where b.unit_variant_id = new.id and (skip = '' or b.id <> skip::uuid)
       and (b.stock_qty is distinct from floor(new.stock_qty::numeric / b.pack_of) or b.track_stock is distinct from new.track_stock);
    perform set_config('babajee.box_sync', '', true);
  end if;
  return null;
end;
$$;
revoke all on function public.product_variants_box_sync() from public, anon, authenticated;
drop trigger if exists product_variants_box_sync on public.product_variants;
create trigger product_variants_box_sync
  after update of stock_qty, track_stock on public.product_variants
  for each row execute function public.product_variants_box_sync();

-- stock history stays on the loose option: a box's own number only mirrors it
create or replace function public.log_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unit_variant_id is not null then
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

-- ---------------------------------------------------------------- 4. cost follows pieces

-- a box's cost: its loose option's, per piece, x the pieces in it
create or replace function public.box_costs_follow(p_unit uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select * into c from public.variant_costs where variant_id = p_unit;
  if c.variant_id is null then
    delete from public.variant_costs vc using public.product_variants b
     where b.unit_variant_id = p_unit and vc.variant_id = b.id;
    return;
  end if;
  -- price, GST paid and its claimable part x the pieces; the cost follows
  -- (0057's trigger: price + GST paid), or straight across for a cost typed
  -- before buying prices (0030)
  insert into public.variant_costs (variant_id, cost, purchase, gst_paid, gst_claimable)
  select b.id, round(c.cost * b.pack_of, 2), round(c.purchase * b.pack_of, 2), round(c.gst_paid * b.pack_of, 2), round(c.gst_claimable * b.pack_of, 2)
    from public.product_variants b where b.unit_variant_id = p_unit
  on conflict (variant_id) do update
    set cost = excluded.cost, purchase = excluded.purchase, gst_paid = excluded.gst_paid, gst_claimable = excluded.gst_claimable;
end;
$$;
revoke all on function public.box_costs_follow(uuid) from public, anon, authenticated;

create or replace function public.variant_costs_box_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  vid uuid := coalesce(new.variant_id, old.variant_id);
begin
  if exists (select 1 from public.product_variants b where b.unit_variant_id = vid) then
    perform public.box_costs_follow(vid);
  end if;
  return null;
end;
$$;
revoke all on function public.variant_costs_box_follow() from public, anon, authenticated;
drop trigger if exists variant_costs_box_follow on public.variant_costs;
create trigger variant_costs_box_follow
  after insert or update or delete on public.variant_costs
  for each row execute function public.variant_costs_box_follow();

-- a new box (or one resized) takes its cost from its loose option
create or replace function public.product_variants_box_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unit_variant_id is not null then
    perform public.box_costs_follow(new.unit_variant_id);
  end if;
  return null;
end;
$$;
revoke all on function public.product_variants_box_cost() from public, anon, authenticated;
drop trigger if exists product_variants_box_cost on public.product_variants;
create trigger product_variants_box_cost
  after insert or update of unit_variant_id, pack_of on public.product_variants
  for each row execute function public.product_variants_box_cost();

-- a box's buying price is its pieces' x pack_of: correct the pieces (0057's
-- corrections) instead
create or replace function public.purchase_corrections_not_box()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.product_variants where id = new.variant_id and unit_variant_id is not null) then
    raise exception 'A box''s buying price follows its pieces: correct the loose option''s price instead.' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists purchase_corrections_not_box on public.purchase_corrections;
create trigger purchase_corrections_not_box before insert on public.purchase_corrections
  for each row execute function public.purchase_corrections_not_box();

-- ---------------------------------------------------------------- 5. bills, voids, counts

create or replace function public.recost_variant(p_variant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  rate numeric;
  g_receipt uuid;
  g_stock numeric := 0;
  g_qty numeric := 0;
  g_sum numeric := 0;
  g_gst numeric := 0;
  avg numeric;
  avg_g numeric;
  g_itc numeric := 0;
  avg_c numeric;
  seen boolean := false;
  u uuid;
begin
  -- a box keeps no average of its own: its loose option does (0061)
  select pv.unit_variant_id into u from public.product_variants pv where pv.id = p_variant;
  if u is not null then
    perform public.recost_variant(u);
    return;
  end if;
  select coalesce(public.product_gst(pv.product_id), 0) into rate from public.product_variants pv where pv.id = p_variant;
  for m in
    with mv as (
      select sm.id, sm.created_at, sm.reason, sm.receipt_id, sm.delta, sm.qty_after,
             row_number() over (partition by sm.receipt_id, sm.reason order by sm.created_at, sm.id) rn
        from public.stock_movements sm
       where sm.variant_id = p_variant),
    -- its own lines, and its boxes' lines in pieces (0061)
    ln as (
      select sl.receipt_id, sl.qty * pv.pack_of as qty, sl.unit_price / pv.pack_of as unit_price, sl.gst, sl.claimable,
             row_number() over (partition by sl.receipt_id order by sl.created_at, sl.id) rn
        from public.stock_receipt_lines sl join public.product_variants pv on pv.id = sl.variant_id
       where sl.variant_id = p_variant or pv.unit_variant_id = p_variant)
    select mv.created_at, mv.id, mv.delta, mv.qty_after, mv.receipt_id,
           coalesce(mv.reason = 'stock_in' and r.status = 'posted' and ln.qty is not null, false) as live,
           ln.qty, ln.unit_price, ln.gst, ln.claimable, false as fix, null::numeric as fix_price, null::numeric as fix_gst
      from mv
      left join public.stock_receipts r on r.id = mv.receipt_id
      left join ln on ln.receipt_id = mv.receipt_id and ln.rn = mv.rn and mv.reason = 'stock_in'
    union all
    select pc.created_at, pc.id, 0, 0, null, false, null, null, null, null, true, pc.purchase, pc.gst_paid
      from public.purchase_corrections pc
     where pc.variant_id = p_variant
     order by 1, 2
  loop
    if m.live and g_receipt is not distinct from m.receipt_id then
      g_qty := g_qty + m.qty;
      g_sum := g_sum + m.qty * m.unit_price;
      g_gst := g_gst + coalesce(m.gst, 0);
      g_itc := g_itc + case when m.claimable then coalesce(m.gst, 0) else 0 end;
      continue;
    end if;
    if g_receipt is not null then
      -- the claimable part, averaged the same way; before any bill (a typed
      -- price) all the GST paid counts as claimable (0059)
      avg_c := round(case when avg is null then g_itc / g_qty
                          else (g_stock * coalesce(avg_c, avg_g, avg * rate / 100) + g_itc) / (g_stock + g_qty) end, 2);
      avg_g := round(case when avg is null then g_gst / g_qty
                          else (g_stock * coalesce(avg_g, avg * rate / 100) + g_gst) / (g_stock + g_qty) end, 2);
      avg := round(case when avg is null then g_sum / g_qty
                        else (g_stock * avg + g_sum) / (g_stock + g_qty) end, 2);
      seen := true;
      g_receipt := null;
    end if;
    if m.fix then
      -- a correction: the average starts again from here
      avg := m.fix_price;
      avg_g := m.fix_gst;
      avg_c := m.fix_gst;
      seen := true;
    elsif m.live then
      g_receipt := m.receipt_id;
      g_stock := greatest(m.qty_after - m.delta, 0);
      g_qty := m.qty;
      g_sum := m.qty * m.unit_price;
      g_gst := coalesce(m.gst, 0);
      g_itc := case when m.claimable then coalesce(m.gst, 0) else 0 end;
    end if;
  end loop;
  if g_receipt is not null then
    avg_c := round(case when avg is null then g_itc / g_qty
                        else (g_stock * coalesce(avg_c, avg_g, avg * rate / 100) + g_itc) / (g_stock + g_qty) end, 2);
    avg_g := round(case when avg is null then g_gst / g_qty
                        else (g_stock * coalesce(avg_g, avg * rate / 100) + g_gst) / (g_stock + g_qty) end, 2);
    avg := round(case when avg is null then g_sum / g_qty
                      else (g_stock * avg + g_sum) / (g_stock + g_qty) end, 2);
    seen := true;
  end if;
  if not seen then
    return;
  end if;
  insert into public.variant_costs (variant_id, cost, purchase, gst_paid, gst_claimable)
  values (p_variant, 0, avg, avg_g, avg_c)
  on conflict (variant_id) do update set purchase = excluded.purchase, gst_paid = excluded.gst_paid, gst_claimable = excluded.gst_claimable;
end;
$$;

create or replace function public.admin_post_receipt(
  p_kind text, p_supplier uuid, p_bill_no text, p_bill_date date, p_notes text, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid;
  bno text := btrim(coalesce(p_bill_no, ''));
  sup text := '';
  shop text := '';
  inter boolean;
  known boolean;
  claim boolean;
  e jsonb;
  v record;
  qty int;
  price numeric;
  rate numeric;
  g numeric;
  c numeric;
  s numeric;
  i numeric;
  stock_now int;
  old_price numeric;
  new_price numeric;
  pk int;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('bill', 'opening', 'quick') then
    raise exception 'Unknown kind of stock in.' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one line.' using errcode = '22023';
  end if;
  if p_kind = 'bill' then
    if p_supplier is null then
      raise exception 'A bill needs a supplier.' using errcode = '22023';
    end if;
    if bno = '' then
      raise exception 'A bill needs its bill number.' using errcode = '22023';
    end if;
    select s2.gstin into sup from public.suppliers s2 where s2.id = p_supplier;
    if not found then
      raise exception 'Supplier not found.' using errcode = 'P0002';
    end if;
  else
    p_supplier := null;
    if p_kind = 'opening' then
      bno := '';
    end if;
  end if;
  -- input credit needs a bill from a GST-registered supplier
  claim := p_kind = 'bill' and btrim(coalesce(sup, '')) <> '';
  select coalesce(st.gstin, '') into shop from public.store_settings st where st.id = 1;
  known := length(coalesce(sup, '')) >= 2 and length(shop) >= 2;
  inter := known and left(sup, 2) <> left(shop, 2);

  if p_kind = 'bill' then
    select r.id into rid from public.stock_receipts r
     where r.kind = 'bill' and r.status = 'posted' and r.supplier_id = p_supplier and lower(r.bill_no) = lower(bno)
     for update;
  end if;
  if rid is null then
    insert into public.stock_receipts (kind, supplier_id, bill_no, bill_date, notes, actor_id)
    values (p_kind, p_supplier, bno, coalesce(p_bill_date, current_date), btrim(coalesce(p_notes, '')), (select auth.uid()))
    returning id into rid;
  end if;

  for e in select x from jsonb_array_elements(p_lines) x loop
    qty := (e ->> 'qty')::int;
    -- to the paisa before GST and the average are worked out
    price := round((e ->> 'unit_price')::numeric, 2);
    if qty is null or qty <= 0 then
      raise exception 'Each line needs a quantity above zero.' using errcode = '22023';
    end if;
    if price is null or price < 0 then
      raise exception 'Each line needs a price.' using errcode = '22023';
    end if;
    select pv.id, pv.product_id, pv.stock_qty, pv.track_stock, pv.unit_variant_id, pv.pack_of into v
      from public.product_variants pv where pv.id = (e ->> 'variant_id')::uuid for update;
    if v.id is null then
      raise exception 'An option on this bill no longer exists.' using errcode = 'P0002';
    end if;
    rate := coalesce((e ->> 'gst_rate')::numeric, public.product_gst(v.product_id), 0);
    if rate < 0 or rate > 100 then
      raise exception 'GST must be between 0%% and 100%%.' using errcode = '22023';
    end if;
    g := round(qty * price * rate / 100, 2);
    if not known then
      c := 0; s := 0; i := 0;
    elsif inter then
      c := 0; s := 0; i := g;
    else
      c := round(g / 2, 2); s := g - c; i := 0;
    end if;
    insert into public.stock_receipt_lines (receipt_id, variant_id, qty, unit_price, gst_rate, gst, cgst, sgst, igst, claimable, created_at)
    values (rid, v.id, qty, price, rate, g, c, s, i, claim, clock_timestamp());

    -- a box (0061): the line stays as billed, boxes at the box price with its
    -- GST to the paisa; the stock and the average move on the loose pieces
    if v.unit_variant_id is not null then
      pk := v.pack_of;
      select pv.id, pv.product_id, pv.stock_qty, pv.track_stock, pv.unit_variant_id, pv.pack_of into v
        from public.product_variants pv where pv.id = v.unit_variant_id for update;
      qty := qty * pk;
      price := price / pk;
    end if;

    -- the average moves with the stock actually on the shelf, before this lot is added
    -- an option not counting stock yet holds nothing: its stock_qty is meaningless
    stock_now := case when v.track_stock then greatest(v.stock_qty, 0) else 0 end;
    select vc.purchase into old_price from public.variant_costs vc where vc.variant_id = v.id;
    new_price := case when old_price is null then price
                      else round((stock_now * old_price + qty * price) / (stock_now + qty), 2) end;
    insert into public.variant_costs (variant_id, cost, purchase)
    values (v.id, 0, new_price)
    on conflict (variant_id) do update set purchase = excluded.purchase;

    perform set_config('babajee.stock_reason', 'stock_in', true);
    perform set_config('babajee.receipt_id', rid::text, true);
    perform set_config('babajee.stock_note', '', true);
    if v.track_stock then
      update public.product_variants set stock_qty = stock_qty + qty where id = v.id;
    else
      -- first stock in: the count starts at exactly this lot, and the movement
      -- reads +qty, qty after = qty (a start from 0), not the old meaningless number
      update public.product_variants set stock_qty = qty, track_stock = true where id = v.id;
      if v.stock_qty = qty then
        insert into public.stock_movements (variant_id, delta, qty_after, reason, receipt_id, note, actor_id, created_at)
        values (v.id, qty, qty, 'stock_in', rid, '', (select auth.uid()), clock_timestamp());
      else
        update public.stock_movements set delta = qty
         where id = (select sm.id from public.stock_movements sm
                      where sm.variant_id = v.id and sm.receipt_id = rid and sm.reason = 'stock_in'
                      order by sm.created_at desc, sm.id desc limit 1);
      end if;
    end if;
    perform set_config('babajee.stock_reason', '', true);
    perform set_config('babajee.receipt_id', '', true);
  end loop;
  return rid;
end;
$$;

create or replace function public.admin_void_receipt(p_receipt uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  l record;
  touched uuid[] := '{}';
  tv uuid;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  select * into r from public.stock_receipts where id = p_receipt for update;
  if not found then
    raise exception 'Receipt not found.' using errcode = 'P0002';
  end if;
  if r.status = 'void' then
    raise exception 'This one is already cancelled.' using errcode = '22023';
  end if;
  update public.stock_receipts set status = 'void', voided_at = now() where id = p_receipt;

  -- a box line (0061) takes its pieces off the loose option, and that is
  -- the one whose average is worked out again
  for l in select sl.variant_id, sl.qty, coalesce(pv.unit_variant_id, sl.variant_id) as costed
             from public.stock_receipt_lines sl join public.product_variants pv on pv.id = sl.variant_id
            where sl.receipt_id = p_receipt order by sl.created_at, sl.id loop
    perform 1 from public.product_variants where id = l.variant_id for update;
    perform set_config('babajee.stock_reason', 'void', true);
    perform set_config('babajee.receipt_id', p_receipt::text, true);
    perform set_config('babajee.stock_note', '', true);
    update public.product_variants set stock_qty = stock_qty - l.qty where id = l.variant_id;
    perform set_config('babajee.stock_reason', '', true);
    perform set_config('babajee.receipt_id', '', true);
    if not (l.costed = any (touched)) then
      touched := touched || l.costed;
    end if;
  end loop;

  foreach tv in array touched loop
    perform public.recost_variant(tv);
  end loop;
end;
$$;

create or replace function public.admin_correct_stock(p_variant uuid, p_count int, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  nt text := btrim(coalesce(p_note, ''));
  was record;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if nt = '' then
    raise exception 'Say why the count is changing.' using errcode = '22023';
  end if;
  if p_count is null or p_count < 0 then
    raise exception 'The count cannot be below zero.' using errcode = '22023';
  end if;
  select pv.stock_qty, pv.track_stock, pv.unit_variant_id into was from public.product_variants pv where pv.id = p_variant for update;
  if not found then
    raise exception 'Option not found.' using errcode = 'P0002';
  end if;
  if was.unit_variant_id is not null then
    raise exception 'A box holds no stock of its own: count the loose pieces instead.' using errcode = '22023';
  end if;
  perform set_config('babajee.stock_reason', 'correction', true);
  perform set_config('babajee.stock_note', nt, true);
  update public.product_variants set stock_qty = p_count, track_stock = true where id = p_variant;
  -- starting to count at the number already there changes no stock, so the
  -- trigger logs nothing: log the count (and its reason) here
  if not was.track_stock and was.stock_qty = p_count then
    insert into public.stock_movements (variant_id, delta, qty_after, reason, note, actor_id, created_at)
    values (p_variant, 0, p_count, 'correction', nt, (select auth.uid()), clock_timestamp());
  end if;
  perform set_config('babajee.stock_reason', '', true);
  perform set_config('babajee.stock_note', '', true);
end;
$$;

-- ---------------------------------------------------------------- 6. lists and reports
-- (a box is listed once, as its loose option's pieces)

create or replace function public.admin_low_stock()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  shop_mark int := coalesce((select low_stock_at from public.store_settings where id = 1), 3);
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'variant_id', v.id, 'product_id', p.id, 'product', p.name, 'option', v.label,
             'stock', v.stock_qty, 'mark', coalesce(p.low_stock_at, shop_mark), 'out', v.stock_qty <= 0)
           order by v.stock_qty, p.name)
      from public.product_variants v join public.products p on p.id = v.product_id
     where v.track_stock and v.is_visible and p.status = 'published' and v.unit_variant_id is null
       and v.stock_qty <= coalesce(p.low_stock_at, shop_mark)), '[]');
end;
$$;

create or replace function public.admin_home_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  shop_mark int := coalesce((select low_stock_at from public.store_settings where id = 1), 3);
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'requests', (select count(*) from public.order_requests where status = 'open'),
    'unpaid', (select count(*) from public.orders where status = 'pending'),
    'to_pack', (select count(*) from public.orders where status = 'paid'),
    'to_ship', (select count(*) from public.orders where status = 'packed'),
    'in_transit', (select count(*) from public.orders where status = 'shipped'),
    'out_of_stock', (select count(*) from public.product_variants where track_stock and is_visible and stock_qty <= 0 and unit_variant_id is null),
    'low_stock', (select count(*) from public.product_variants v join public.products p on p.id = v.product_id
                   where v.track_stock and v.is_visible and v.unit_variant_id is null and v.stock_qty between 1 and coalesce(p.low_stock_at, shop_mark)),
    'unpriced', (select count(*) from public.product_variants where is_visible and price = 0)
  );
end;
$$;

create or replace function public.admin_uncounted()
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return (select count(*)::int from public.product_variants where not track_stock and unit_variant_id is null);
end;
$$;

create or replace function public.admin_track_all_stock()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  -- an old hand-typed count was never logged, so every option starts from 0
  -- and each nonzero count leaves a correction to 0 in its history
  perform set_config('babajee.stock_reason', 'correction', true);
  perform set_config('babajee.stock_note', 'Started counting', true);
  -- loose options only: their boxes follow (0061)
  update public.product_variants set track_stock = true, stock_qty = 0 where not track_stock and unit_variant_id is null;
  get diagnostics n = row_count;
  perform set_config('babajee.stock_reason', '', true);
  perform set_config('babajee.stock_note', '', true);
  return n;
end;
$$;

create or replace function public.admin_units_sold()
returns table (product_id uuid, units bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
    -- in pieces: a box sold counts as the pieces in it (0061)
    select pv.product_id, sum((i.quantity - coalesce(ir.qty, 0)) * pv.pack_of)::bigint
      from public.order_items i
      join public.orders o on o.id = i.order_id and o.status <> 'cancelled'
      join public.product_variants pv on pv.id = i.variant_id
      left join public.order_item_refunded ir on ir.order_item_id = i.id
     group by pv.product_id;
end;
$$;

create or replace function public.admin_report(p_kind text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t0 timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  t1 timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
  ndays int := (p_to - p_from) + 1;
  credit boolean;
  home text;
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if p_to < p_from or ndays > 3700 then
    raise exception 'Pick a start date on or before the end date.' using errcode = '22023';
  end if;
  select coalesce(st.gst_input_credit, false), coalesce(st.store_state, '')
    into credit, home
    from public.store_settings st where st.id = 1;
  credit := coalesce(credit, false);
  home := coalesce(home, '');

  if p_kind = 'products' then
    with o as (
      select * from public.orders where created_at >= t0 and created_at < t1 and status not in ('cancelled', 'pending') and not is_test
    ),
    l as (
      select i.product_name, i.variant_label, i.quantity as qty, i.unit_price as price, i.gst_rate as rate,
             i.quantity - coalesce(ir.qty, 0) as q,
             i.quantity - coalesce(ir.restocked, 0) as gone,
             coalesce(ir.qty, 0) as back,
             case when o.gst_inclusive then i.unit_price else i.unit_price * (100 + i.gst_rate) / 100 end as sale,
             case when o.gst_inclusive then i.unit_price * 100 / (100 + i.gst_rate) else i.unit_price end as net,
             coalesce(c.unit_cost, vc.cost) as cost
        from o
        join public.order_items i on i.order_id = o.id
        left join public.order_item_refunded ir on ir.order_item_id = i.id
        left join public.order_item_costs c on c.order_item_id = i.id
        left join public.variant_costs vc on vc.variant_id = i.variant_id
    )
    select coalesce(jsonb_agg(x order by x.gross desc, x.product), '[]') into r from (
      select product_name as product,
             variant_label as option,
             max(rate) as gst_rate,
             sum(q) as sold,
             sum(qty * price) as gross,
             sum(back * price) as returns,
             sum(q * price) as net,
             round(sum(q * sale), 2) as sales,
             round(sum(q * net), 2) as sales_ex_gst,
             case when bool_and(cost is not null) then round(sum(gone * cost), 2) end as cost,
             case when bool_and(cost is not null) then round(sum(q * sale - gone * cost), 2) end as profit
        from l
       group by product_name, variant_label
    ) x;

  elsif p_kind = 'customers' then
    with o as (
      select o.*, coalesce(rt.subtotal, 0) as r_sub,
             (select coalesce(sum(i.quantity - coalesce(ir.qty, 0)), 0)
                from public.order_items i left join public.order_item_refunded ir on ir.order_item_id = i.id
               where i.order_id = o.id) as items
        from public.orders o left join public.order_refund_totals rt on rt.order_id = o.id
       where o.created_at >= t0 and o.created_at < t1 and o.status not in ('cancelled', 'pending') and not o.is_test
    )
    select coalesce(jsonb_agg(x order by x.net desc, x.name), '[]') into r from (
      select (array_agg(contact_name order by created_at desc))[1] as name,
             (array_agg(contact_email order by created_at desc))[1] as email,
             (array_agg(contact_phone order by created_at desc))[1] as phone,
             bool_and(profile_id is null) as guest,
             count(*) as orders,
             sum(items) as items,
             sum(subtotal) as gross,
             sum(r_sub) as returns,
             sum(subtotal - r_sub) as net,
             round(sum(subtotal) / count(*), 2) as average,
             min(created_at at time zone 'Asia/Kolkata')::date as first_order,
             max(created_at at time zone 'Asia/Kolkata')::date as last_order
        from o
       group by coalesce(profile_id::text, lower(contact_email))
    ) x;

  elsif p_kind = 'stock' then
    -- boxes sold count as their pieces, on the loose option (0061)
    with sold as (
      select coalesce(pv.unit_variant_id, i.variant_id) as variant_id, sum((i.quantity - coalesce(ir.qty, 0)) * coalesce(pv.pack_of, 1)) as q
        from public.orders o join public.order_items i on i.order_id = o.id
        left join public.order_item_refunded ir on ir.order_item_id = i.id
        left join public.product_variants pv on pv.id = i.variant_id
       where o.created_at >= t0 and o.created_at < t1 and o.status not in ('cancelled', 'pending') and not o.is_test
       group by 1
    )
    select coalesce(jsonb_agg(x order by x.days_left asc nulls last, x.sold desc, x.product, x.option), '[]') into r from (
      select p.name as product, v.label as option, v.sku, v.track_stock as tracked,
             case when v.track_stock then v.stock_qty end as in_stock,
             coalesce(s.q, 0) as sold,
             round(coalesce(s.q, 0)::numeric / ndays, 2) as per_day,
             case when v.track_stock and coalesce(s.q, 0) > 0
                  then floor(v.stock_qty / (s.q::numeric / ndays)) end as days_left,
             case when v.track_stock and coalesce(s.q, 0) + v.stock_qty > 0
                  then round(coalesce(s.q, 0) * 100.0 / (coalesce(s.q, 0) + v.stock_qty), 1) end as sell_through
        from public.product_variants v
        join public.products p on p.id = v.product_id
        left join sold s on s.variant_id = v.id
       where v.unit_variant_id is null
    ) x;

  elsif p_kind = 'finance' then
    with o as (
      select o.*, date_trunc('month', o.created_at at time zone 'Asia/Kolkata')::date as month,
             coalesce(rt.amount, 0) as r_amt, coalesce(rt.subtotal, 0) as r_sub,
             coalesce(rt.shipping, 0) as r_ship, coalesce(rt.tax, 0) as r_tax, coalesce(rt.extra, 0) as extra
        from public.orders o left join public.order_refund_totals rt on rt.order_id = o.id
       where o.created_at >= t0 and o.created_at < t1 and o.status not in ('cancelled', 'pending') and not o.is_test
    ),
    l as (
      select o.month, o.id as order_id,
             i.quantity - coalesce(ir.qty, 0) as q,
             i.quantity - coalesce(ir.restocked, 0) as gone,
             case when o.gst_inclusive then i.unit_price else i.unit_price * (100 + i.gst_rate) / 100 end as sale,
             coalesce(oc.unit_cost, vc.cost) as cost, i.gst_rate as rate,
             coalesce(oc.unit_gst, case when oc.unit_cost is null then vc.gst_paid end) as gst0
        from o
        join public.order_items i on i.order_id = o.id
        left join public.order_item_refunded ir on ir.order_item_id = i.id
        left join public.order_item_costs oc on oc.order_item_id = i.id
        left join public.variant_costs vc on vc.variant_id = i.variant_id
    ),
    c as (
      select month,
             sum(gone * cost) as cost,
             sum(gone * coalesce(gst0, cost * rate / (100 + rate))) filter (where credit) as gst_paid,
             sum(q * sale) filter (where cost is not null) as costed_sales,
             count(*) filter (where cost is null and gone > 0) as uncosted
        from l group by month
    ),
    x as (
      select o.month, sum(o.extra * case when o.gst_inclusive or o.subtotal = 0 then 1 else (o.subtotal + o.tax) / o.subtotal end) as extra_g
        from o where o.extra <> 0 group by o.month
    )
    select coalesce(jsonb_agg(y order by y.month), '[]') into r from (
      select m.month,
             count(*) filter (where m.status <> 'refunded') as orders,
             sum(m.subtotal) as gross,
             sum(m.r_sub) as returns,
             sum(m.subtotal - m.r_sub) as net,
             sum(m.shipping - m.r_ship) as delivery,
             sum(m.tax - m.r_tax) as gst,
             sum(coalesce(m.paid_total, m.total) - m.r_amt) filter (where m.status <> 'pending') as collected,
             case when max(c.costed_sales) is not null then round(max(c.cost), 2) end as cost,
             case when max(c.costed_sales) is not null then round(max(c.costed_sales) - max(c.cost) - coalesce(max(x.extra_g), 0), 2) end as profit,
             greatest(round(sum(m.tax - m.r_tax) - coalesce(max(c.gst_paid), 0), 2), 0) as gst_to_pay,
             coalesce(max(c.uncosted), 0) as uncosted_lines
        from o m left join c on c.month = m.month left join x on x.month = m.month
       group by m.month
    ) y;

  elsif p_kind = 'gst' then
    -- per line at its own bracket; each order's lines are scaled so they add
    -- up to the GST the order kept after refunds
    with o as (
      select o.*, coalesce(rt.tax, 0) as r_tax
        from public.orders o left join public.order_refund_totals rt on rt.order_id = o.id
       where o.created_at >= t0 and o.created_at < t1 and o.status not in ('cancelled', 'refunded', 'pending') and not o.is_test
    ),
    l as (
      select o.id as order_id, date_trunc('month', o.created_at at time zone 'Asia/Kolkata')::date as month,
             o.address_state as place, i.gst_rate as rate, o.tax - o.r_tax as order_gst,
             public.line_gst((i.quantity - coalesce(ir.qty, 0)) * i.unit_price, i.gst_rate, o.gst_inclusive) as g,
             (i.quantity - coalesce(ir.qty, 0)) * i.unit_price as gross,
             o.gst_inclusive as incl
        from o
        join public.order_items i on i.order_id = o.id
        left join public.order_item_refunded ir on ir.order_item_id = i.id
    ),
    s as (
      select l.*, case when sum(g) over (partition by order_id) > 0 then order_gst / sum(g) over (partition by order_id) else 0 end as f
        from l
    ),
    y as (
      select month, place, rate,
             count(distinct order_id) as orders,
             round(sum(case when incl then gross - g else gross end * case when f > 0 then f else 1 end), 2) as taxable,
             round(sum(g * f), 2) as gst
        from s group by 1, 2, 3
    )
    select coalesce(jsonb_agg(x order by x.month, x.place, x.rate), '[]') into r from (
      select month, place, rate, orders, taxable,
             case when home = '' then null when place = home then 0 else gst end as igst,
             case when home = '' then null when place = home then round(gst / 2, 2) else 0 end as cgst,
             case when home = '' then null when place = home then gst - round(gst / 2, 2) else 0 end as sgst,
             gst
        from y
    ) x;

  else
    raise exception 'Unknown report %.', p_kind using errcode = '22023';
  end if;

  return r;
end;
$$;
