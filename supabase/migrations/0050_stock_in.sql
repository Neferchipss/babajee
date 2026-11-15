-- Stock in: suppliers, supplier bills and the average buying price.
--
-- 1. suppliers: who the shop buys from (name, GSTIN, phone).
-- 2. stock_receipts + stock_receipt_lines: every time stock comes in. A receipt
--    is a supplier bill (kind 'bill'), the opening stock count ('opening') or a
--    quick add with no paperwork ('quick'). Each line keeps the price paid
--    (before GST), the GST on it and how it splits into CGST/SGST/IGST.
--    Only bills can be claimed back as input tax credit.
-- 3. stock_movements gains receipt_id and note, and three reasons: stock_in,
--    void and correction. log_stock_movement() reads them from the same
--    transaction-local settings as the order id.
-- 4. The buying price (variant_costs.purchase) becomes a running average that
--    follows the real stock on the shelf:
--      new = (max(stock, 0) * old + qty * price) / (max(stock, 0) + qty)
--    admin_post_receipt applies it as stock comes in. After a void,
--    recost_variant() replays the option's stock movements in time order, so
--    sales in between count and the cancelled bill drops out.
-- 5. admin_post_receipt / admin_void_receipt / admin_correct_stock change the
--    stock count; admin_suppliers / admin_save_supplier / admin_receipts /
--    admin_receipt / admin_uncounted / admin_track_all_stock /
--    admin_purchase_gst read and manage it. All admins only.
-- 6. Stock can now go below zero: a sale that was entered before the bill
--    reached the system, or a void after the goods were sold, leaves a negative
--    count for the shop to correct, instead of blocking the change.
-- 7. The three new tables join the audit log and the data download.
--
-- Also: bill lines keep their option for good (an option or product with stock
-- bills cannot be deleted, only hidden).
--
-- Depends on 0049, 0023. Safe to re-run.

-- ---------------------------------------------------------------- 1. tables

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  gstin text not null default '',
  phone text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.suppliers drop constraint if exists suppliers_gstin_format;
alter table public.suppliers add constraint suppliers_gstin_format
  check (gstin = '' or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');

create table if not exists public.stock_receipts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('bill', 'opening', 'quick')),
  supplier_id uuid references public.suppliers (id) on delete restrict,
  bill_no text not null default '',
  bill_date date not null default current_date,
  notes text not null default '',
  status text not null default 'posted' check (status in ('posted', 'void')),
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz
);

-- one live bill per supplier and bill number (a voided number can be used again)
create unique index if not exists stock_receipts_bill_unique
  on public.stock_receipts (supplier_id, lower(bill_no))
  where status = 'posted' and kind = 'bill';
create index if not exists stock_receipts_date_idx on public.stock_receipts (bill_date desc, created_at desc);

create table if not exists public.stock_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.stock_receipts (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  qty int not null check (qty > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  gst_rate numeric(5, 2) not null default 0,
  gst numeric(10, 2) not null default 0,
  cgst numeric(10, 2) not null default 0,
  sgst numeric(10, 2) not null default 0,
  igst numeric(10, 2) not null default 0,
  claimable boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists stock_receipt_lines_receipt_idx on public.stock_receipt_lines (receipt_id);
create index if not exists stock_receipt_lines_variant_idx on public.stock_receipt_lines (variant_id);

do $$
declare
  t text;
begin
  foreach t in array array['suppliers', 'stock_receipts', 'stock_receipt_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admins read" on public.%I', t);
    execute format('create policy "admins read" on public.%I for select to authenticated using (public.is_admin())', t);
    execute format('revoke all on public.%I from anon, authenticated, public', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop trigger if exists audit_row on public.%I', t);
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- 2. stock movements

alter table public.stock_movements
  add column if not exists receipt_id uuid references public.stock_receipts (id) on delete set null;
alter table public.stock_movements
  add column if not exists note text not null default '';
create index if not exists stock_movements_receipt_idx on public.stock_movements (receipt_id) where receipt_id is not null;

alter table public.stock_movements drop constraint if exists stock_movements_reason_check;
alter table public.stock_movements add constraint stock_movements_reason_check
  check (reason in ('sale', 'cancel', 'refund', 'return', 'edit', 'undo', 'manual', 'stock_in', 'void', 'correction'));

-- stock may go below zero (see 6 above)
alter table public.product_variants drop constraint if exists product_variants_stock_qty_check;

create or replace function public.log_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

-- ---------------------------------------------------------------- 3. average buying price

-- Replays the option's stock movements in time order. At each stock_in that
-- belongs to a receipt still posted, the average moves by
--   new = (max(stock before, 0) * old + qty * price) / (max(stock before, 0) + qty)
-- (the first receipt sets it; several lines of one receipt for the same option
-- in a row count together). Sales, refunds and corrections only change the
-- stock before the next receipt. No posted receipt left: the price already
-- there stays.
create or replace function public.recost_variant(p_variant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  g_receipt uuid;
  g_stock numeric := 0;
  g_qty numeric := 0;
  g_sum numeric := 0;
  avg numeric;
  seen boolean := false;
begin
  for m in
    with mv as (
      select sm.id, sm.created_at, sm.reason, sm.receipt_id, sm.delta, sm.qty_after,
             row_number() over (partition by sm.receipt_id, sm.reason order by sm.created_at, sm.id) rn
        from public.stock_movements sm
       where sm.variant_id = p_variant),
    ln as (
      select sl.receipt_id, sl.qty, sl.unit_price,
             row_number() over (partition by sl.receipt_id order by sl.created_at, sl.id) rn
        from public.stock_receipt_lines sl
       where sl.variant_id = p_variant)
    select mv.created_at, mv.id, mv.delta, mv.qty_after, mv.receipt_id,
           coalesce(mv.reason = 'stock_in' and r.status = 'posted' and ln.qty is not null, false) as live,
           ln.qty, ln.unit_price
      from mv
      left join public.stock_receipts r on r.id = mv.receipt_id
      left join ln on ln.receipt_id = mv.receipt_id and ln.rn = mv.rn and mv.reason = 'stock_in'
     order by mv.created_at, mv.id
  loop
    if m.live and g_receipt is not distinct from m.receipt_id then
      g_qty := g_qty + m.qty;
      g_sum := g_sum + m.qty * m.unit_price;
      continue;
    end if;
    if g_receipt is not null then
      avg := round(case when avg is null then g_sum / g_qty
                        else (g_stock * avg + g_sum) / (g_stock + g_qty) end, 2);
      seen := true;
      g_receipt := null;
    end if;
    if m.live then
      g_receipt := m.receipt_id;
      g_stock := greatest(m.qty_after - m.delta, 0);
      g_qty := m.qty;
      g_sum := m.qty * m.unit_price;
    end if;
  end loop;
  if g_receipt is not null then
    avg := round(case when avg is null then g_sum / g_qty
                      else (g_stock * avg + g_sum) / (g_stock + g_qty) end, 2);
    seen := true;
  end if;
  if not seen then
    return;
  end if;
  insert into public.variant_costs (variant_id, cost, purchase)
  values (p_variant, 0, avg)
  on conflict (variant_id) do update set purchase = excluded.purchase;
end;
$$;

-- ---------------------------------------------------------------- 4. suppliers

create or replace function public.admin_suppliers()
returns setof public.suppliers
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query select s.* from public.suppliers s order by s.active desc, lower(s.name), s.created_at;
end;
$$;

create or replace function public.admin_save_supplier(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
  nm text := btrim(coalesce(p ->> 'name', ''));
  gs text := upper(btrim(coalesce(p ->> 'gstin', '')));
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if nm = '' then
    raise exception 'The supplier needs a name.' using errcode = '22023';
  end if;
  if gs <> '' and gs !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'That GSTIN does not look right.' using errcode = '22023';
  end if;
  if nullif(p ->> 'id', '') is null then
    insert into public.suppliers (name, gstin, phone, notes, active)
    values (nm, gs, btrim(coalesce(p ->> 'phone', '')), btrim(coalesce(p ->> 'notes', '')),
            coalesce((p ->> 'active')::boolean, true))
    returning id into sid;
  else
    sid := (p ->> 'id')::uuid;
    update public.suppliers
       set name = nm, gstin = gs,
           phone = btrim(coalesce(p ->> 'phone', '')),
           notes = btrim(coalesce(p ->> 'notes', '')),
           active = coalesce((p ->> 'active')::boolean, active)
     where id = sid;
    if not found then
      raise exception 'Supplier not found.' using errcode = 'P0002';
    end if;
  end if;
  return sid;
end;
$$;

-- ---------------------------------------------------------------- 5. stock in, void, correction

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
  claim boolean := (p_kind = 'bill');
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
    price := (e ->> 'unit_price')::numeric;
    if qty is null or qty <= 0 then
      raise exception 'Each line needs a quantity above zero.' using errcode = '22023';
    end if;
    if price is null or price < 0 then
      raise exception 'Each line needs a price.' using errcode = '22023';
    end if;
    select pv.id, pv.product_id, pv.stock_qty, pv.track_stock into v
      from public.product_variants pv where pv.id = (e ->> 'variant_id')::uuid for update;
    if v.id is null then
      raise exception 'An option on this bill no longer exists.' using errcode = 'P0002';
    end if;
    rate := coalesce((e ->> 'gst_rate')::numeric, public.product_gst(v.product_id), 0);
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

  for l in select sl.variant_id, sl.qty from public.stock_receipt_lines sl where sl.receipt_id = p_receipt order by sl.created_at, sl.id loop
    perform 1 from public.product_variants where id = l.variant_id for update;
    perform set_config('babajee.stock_reason', 'void', true);
    perform set_config('babajee.receipt_id', p_receipt::text, true);
    perform set_config('babajee.stock_note', '', true);
    update public.product_variants set stock_qty = stock_qty - l.qty where id = l.variant_id;
    perform set_config('babajee.stock_reason', '', true);
    perform set_config('babajee.receipt_id', '', true);
    if not (l.variant_id = any (touched)) then
      touched := touched || l.variant_id;
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
  perform 1 from public.product_variants where id = p_variant for update;
  if not found then
    raise exception 'Option not found.' using errcode = 'P0002';
  end if;
  perform set_config('babajee.stock_reason', 'correction', true);
  perform set_config('babajee.stock_note', nt, true);
  update public.product_variants set stock_qty = p_count, track_stock = true where id = p_variant;
  perform set_config('babajee.stock_reason', '', true);
  perform set_config('babajee.stock_note', '', true);
end;
$$;

-- ---------------------------------------------------------------- 5b. no deleting what a bill names

-- A bill line keeps its option for good (the claimable GST lives on it), so an
-- option or product with stock bills is hidden, never deleted.
create or replace function public.guard_variant_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.stock_receipt_lines where variant_id = old.id) then
    raise exception 'This option has stock bills against it, so it cannot be deleted. Hide it instead.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists product_variants_guard_delete on public.product_variants;
create trigger product_variants_guard_delete
  before delete on public.product_variants
  for each row execute function public.guard_variant_delete();

-- admin_delete_product (0023) with the same refusal
create or replace function public.admin_delete_product(p_product uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.order_items oi
    join public.product_variants v on v.id = oi.variant_id
    where v.product_id = p_product
  ) then
    raise exception 'product_ordered' using errcode = 'P0001', hint = 'This product has been ordered. Hide it instead.';
  end if;
  if exists (
    select 1 from public.stock_receipt_lines sl
    join public.product_variants v on v.id = sl.variant_id
    where v.product_id = p_product
  ) then
    raise exception 'This product has stock bills against it, so it cannot be deleted. Hide it instead.'
      using errcode = 'P0001';
  end if;
  delete from public.cart_items ci using public.product_variants v
  where ci.variant_id = v.id and v.product_id = p_product;
  delete from public.products where id = p_product;
end;
$$;

-- ---------------------------------------------------------------- 6. reading

create or replace function public.admin_receipts(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'kind', r.kind, 'status', r.status,
             'supplier', s.name, 'bill_no', r.bill_no, 'bill_date', r.bill_date,
             'lines', coalesce(t.n, 0), 'qty', coalesce(t.q, 0),
             'taxable', coalesce(t.taxable, 0), 'gst', coalesce(t.gst, 0))
           order by r.bill_date desc, r.created_at desc)
      from public.stock_receipts r
      left join public.suppliers s on s.id = r.supplier_id
      left join lateral (
        select count(*) n, sum(sl.qty) q, sum(round(sl.qty * sl.unit_price, 2)) taxable, sum(sl.gst) gst
          from public.stock_receipt_lines sl where sl.receipt_id = r.id) t on true
     where (p_from is null or r.bill_date >= p_from) and (p_to is null or r.bill_date <= p_to)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_receipt(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
             'id', r.id, 'kind', r.kind, 'status', r.status,
             'supplier_id', r.supplier_id, 'supplier', s.name, 'supplier_gstin', s.gstin,
             'bill_no', r.bill_no, 'bill_date', r.bill_date, 'notes', r.notes,
             'created_at', r.created_at, 'voided_at', r.voided_at,
             'lines', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', sl.id, 'variant_id', sl.variant_id, 'product', p.name, 'option', pv.label,
                        'qty', sl.qty, 'unit_price', sl.unit_price, 'gst_rate', sl.gst_rate,
                        'gst', sl.gst, 'cgst', sl.cgst, 'sgst', sl.sgst, 'igst', sl.igst,
                        'claimable', sl.claimable) order by sl.created_at, sl.id)
                 from public.stock_receipt_lines sl
                 join public.product_variants pv on pv.id = sl.variant_id
                 join public.products p on p.id = pv.product_id
                where sl.receipt_id = r.id), '[]'::jsonb))
      from public.stock_receipts r
      left join public.suppliers s on s.id = r.supplier_id
     where r.id = p_id);
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
  return (select count(*)::int from public.product_variants where not track_stock);
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
  update public.product_variants set track_stock = true where not track_stock;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.admin_purchase_gst(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(m order by m ->> 'month')
      from (
        select jsonb_build_object(
                 'month', to_char(r.bill_date, 'YYYY-MM'),
                 'taxable', sum(round(sl.qty * sl.unit_price, 2)),
                 'gst', sum(sl.gst),
                 'cgst', sum(sl.cgst),
                 'sgst', sum(sl.sgst),
                 'igst', sum(sl.igst),
                 'claimable_gst', coalesce(sum(sl.gst) filter (where sl.claimable), 0)) m
          from public.stock_receipt_lines sl
          join public.stock_receipts r on r.id = sl.receipt_id
         where r.status = 'posted'
           and (p_from is null or r.bill_date >= p_from) and (p_to is null or r.bill_date <= p_to)
         group by to_char(r.bill_date, 'YYYY-MM')) x
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------- 7. data download

create or replace function public.export_table_list()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['addresses', 'audit_log', 'cart_items', 'carts', 'categories', 'collection_items', 'collections',
               'customer_notes', 'customer_segments', 'login_events', 'order_events', 'order_item_costs', 'order_items',
               'order_refund_items', 'order_refunds', 'order_requests', 'orders', 'payments', 'product_images',
               'product_reviews', 'product_variants', 'products', 'profiles', 'saved_products', 'shipments',
               'site_events', 'stock_daily', 'stock_movements', 'stock_receipt_lines', 'stock_receipts', 'suppliers',
               'variant_costs'];
$$;

-- ---------------------------------------------------------------- 8. who may call what

revoke all on function public.recost_variant(uuid) from public, anon, authenticated;
revoke all on function public.guard_variant_delete() from public, anon, authenticated;
revoke all on function public.admin_delete_product(uuid) from public, anon;
grant execute on function public.admin_delete_product(uuid) to authenticated;
revoke all on function public.admin_suppliers() from public, anon;
revoke all on function public.admin_save_supplier(jsonb) from public, anon;
revoke all on function public.admin_post_receipt(text, uuid, text, date, text, jsonb) from public, anon;
revoke all on function public.admin_void_receipt(uuid) from public, anon;
revoke all on function public.admin_correct_stock(uuid, int, text) from public, anon;
revoke all on function public.admin_receipts(date, date) from public, anon;
revoke all on function public.admin_receipt(uuid) from public, anon;
revoke all on function public.admin_uncounted() from public, anon;
revoke all on function public.admin_track_all_stock() from public, anon;
revoke all on function public.admin_purchase_gst(date, date) from public, anon;
revoke all on function public.export_table_list() from public, anon;
grant execute on function public.admin_suppliers() to authenticated;
grant execute on function public.admin_save_supplier(jsonb) to authenticated;
grant execute on function public.admin_post_receipt(text, uuid, text, date, text, jsonb) to authenticated;
grant execute on function public.admin_void_receipt(uuid) to authenticated;
grant execute on function public.admin_correct_stock(uuid, int, text) to authenticated;
grant execute on function public.admin_receipts(date, date) to authenticated;
grant execute on function public.admin_receipt(uuid) to authenticated;
grant execute on function public.admin_uncounted() to authenticated;
grant execute on function public.admin_track_all_stock() to authenticated;
grant execute on function public.admin_purchase_gst(date, date) to authenticated;
grant execute on function public.export_table_list() to authenticated;
