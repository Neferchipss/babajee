-- GST paid to the supplier, the rebate on it, and profit that uses both.
--
-- Until now an option's cost was "purchase price + GST at the product's own
-- (selling) bracket", and the profit took that GST back out at the selling
-- rate when input tax credit was on. A supplier can charge a different rate
-- (or a different amount) from the one the shop sells at, and only some bill
-- lines can be claimed back (the supplier's GSTIN, GSTR-2B), so both were off.
--
-- 1. variant_costs keeps, per piece:
--      supplier_gst_rate  the rate the supplier charged, as typed (null: the
--                         product's own bracket)
--      supplier_gst       the GST amount paid per piece, as typed; when set it
--                         wins over the rate (a bill that rounds differently)
--      gst_paid           the GST paid per piece, worked out from the above,
--                         or the average off the supplier bills
--      gst_claimable      the part of gst_paid that can be claimed back: all
--                         of it when typed, the claimable bill lines' share
--                         when it comes from bills
--      gst_source         'typed' or 'bills'
--    cost stays "purchase + GST paid", per piece, as before.
-- 2. recost_variant() averages the GST per piece off the bills alongside the
--    buying price, weighted the same way (stock on hand before each bill).
-- 3. order_item_costs snapshots the GST paid and the claimable part at sale.
-- 4. admin_profit() takes the GST out of the cost as paid, claims back only
--    the claimable part (and only with input tax credit on in Settings), and
--    reports both: gst_paid, itc, gst_owed.
--
-- Re-run safe.

-- ---------------------------------------------------------------- 1. per piece

alter table public.variant_costs add column if not exists supplier_gst_rate numeric(5, 2)
  check (supplier_gst_rate is null or supplier_gst_rate between 0 and 100);
alter table public.variant_costs add column if not exists supplier_gst numeric(10, 2)
  check (supplier_gst is null or supplier_gst >= 0);
alter table public.variant_costs add column if not exists gst_paid numeric(10, 2);
alter table public.variant_costs add column if not exists gst_claimable numeric(10, 2);
alter table public.variant_costs add column if not exists gst_source text not null default 'typed';
alter table public.variant_costs drop constraint if exists variant_costs_gst_source_check;
alter table public.variant_costs add constraint variant_costs_gst_source_check
  check (gst_source in ('typed', 'bills'));

-- cost = purchase + GST paid. Typed: the typed amount, else the typed rate,
-- else the product's bracket. From bills: what recost_variant() put there.
create or replace function public.variant_costs_from_purchase()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.purchase is null then
    return new;
  end if;
  if new.gst_source = 'typed' then
    new.gst_paid := coalesce(new.supplier_gst, round(new.purchase * coalesce(new.supplier_gst_rate,
      (select public.product_gst(pv.product_id) from public.product_variants pv where pv.id = new.variant_id), 0) / 100, 2));
    new.gst_claimable := new.gst_paid;
  end if;
  new.cost := round(new.purchase + coalesce(new.gst_paid, 0), 2);
  return new;
end;
$$;

-- ---------------------------------------------------------------- 2. from the bills

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
  g_gst numeric := 0;
  g_itc numeric := 0;
  avg numeric;
  avg_gst numeric;
  avg_itc numeric;
  seen boolean := false;
begin
  for m in
    with mv as (
      select sm.id, sm.created_at, sm.reason, sm.receipt_id, sm.delta, sm.qty_after,
             row_number() over (partition by sm.receipt_id, sm.reason order by sm.created_at, sm.id) rn
        from public.stock_movements sm
       where sm.variant_id = p_variant),
    ln as (
      select sl.receipt_id, sl.qty, sl.unit_price, sl.gst, sl.claimable,
             row_number() over (partition by sl.receipt_id order by sl.created_at, sl.id) rn
        from public.stock_receipt_lines sl
       where sl.variant_id = p_variant)
    select mv.created_at, mv.id, mv.delta, mv.qty_after, mv.receipt_id,
           coalesce(mv.reason = 'stock_in' and r.status = 'posted' and ln.qty is not null, false) as live,
           ln.qty, ln.unit_price, ln.gst, ln.claimable
      from mv
      left join public.stock_receipts r on r.id = mv.receipt_id
      left join ln on ln.receipt_id = mv.receipt_id and ln.rn = mv.rn and mv.reason = 'stock_in'
     order by mv.created_at, mv.id
  loop
    if m.live and g_receipt is not distinct from m.receipt_id then
      g_qty := g_qty + m.qty;
      g_sum := g_sum + m.qty * m.unit_price;
      g_gst := g_gst + m.gst;
      g_itc := g_itc + case when m.claimable then m.gst else 0 end;
      continue;
    end if;
    if g_receipt is not null then
      if avg is null then
        avg := g_sum / g_qty; avg_gst := g_gst / g_qty; avg_itc := g_itc / g_qty;
      else
        avg := (g_stock * avg + g_sum) / (g_stock + g_qty);
        avg_gst := (g_stock * avg_gst + g_gst) / (g_stock + g_qty);
        avg_itc := (g_stock * avg_itc + g_itc) / (g_stock + g_qty);
      end if;
      avg := round(avg, 2); avg_gst := round(avg_gst, 2); avg_itc := round(avg_itc, 2);
      seen := true;
      g_receipt := null;
    end if;
    if m.live then
      g_receipt := m.receipt_id;
      g_stock := greatest(m.qty_after - m.delta, 0);
      g_qty := m.qty;
      g_sum := m.qty * m.unit_price;
      g_gst := m.gst;
      g_itc := case when m.claimable then m.gst else 0 end;
    end if;
  end loop;
  if g_receipt is not null then
    if avg is null then
      avg := g_sum / g_qty; avg_gst := g_gst / g_qty; avg_itc := g_itc / g_qty;
    else
      avg := (g_stock * avg + g_sum) / (g_stock + g_qty);
      avg_gst := (g_stock * avg_gst + g_gst) / (g_stock + g_qty);
      avg_itc := (g_stock * avg_itc + g_itc) / (g_stock + g_qty);
    end if;
    avg := round(avg, 2); avg_gst := round(avg_gst, 2); avg_itc := round(avg_itc, 2);
    seen := true;
  end if;
  if not seen then
    -- no posted bill left (the last one was voided): back to typed GST, at
    -- the typed amount or rate, else the product's bracket
    update public.variant_costs set gst_source = 'typed', purchase = purchase
     where variant_id = p_variant and gst_source = 'bills';
    return;
  end if;
  insert into public.variant_costs (variant_id, cost, purchase, gst_paid, gst_claimable, gst_source)
  values (p_variant, 0, avg, avg_gst, avg_itc, 'bills')
  on conflict (variant_id) do update
    set purchase = excluded.purchase, gst_paid = excluded.gst_paid,
        gst_claimable = excluded.gst_claimable, gst_source = 'bills';
end;
$$;
revoke all on function public.recost_variant(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. at sale

alter table public.order_item_costs add column if not exists unit_gst numeric(10, 2);
alter table public.order_item_costs add column if not exists unit_itc numeric(10, 2);

-- whoever writes the cost (checkout, an order taken by the shop, an edit),
-- the GST paid and its claimable part come along from the option
create or replace function public.order_item_costs_gst()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- a new line, or its cost rewritten (an edit): take the option's as it is now
  if new.unit_gst is null or tg_op = 'UPDATE' then
    select vc.gst_paid, vc.gst_claimable into new.unit_gst, new.unit_itc
      from public.order_items i join public.variant_costs vc on vc.variant_id = i.variant_id
     where i.id = new.order_item_id;
  end if;
  return new;
end;
$$;
revoke all on function public.order_item_costs_gst() from public, anon, authenticated;

drop trigger if exists order_item_costs_gst on public.order_item_costs;
create trigger order_item_costs_gst
  before insert or update of unit_cost on public.order_item_costs
  for each row execute function public.order_item_costs_gst();

-- ---------------------------------------------------------------- 4. profit

create or replace function public.admin_profit(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t0 timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  t1 timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
  credit boolean;
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  select st.gst_input_credit into credit from public.store_settings st where st.id = 1;
  credit := coalesce(credit, false);

  with o as (
    select x.*, coalesce(rt.tax, 0) as r_tax, coalesce(rt.extra, 0) as extra
      from public.orders x left join public.order_refund_totals rt on rt.order_id = x.id
     where x.created_at >= t0 and x.created_at < t1 and x.status <> 'cancelled'
  ),
  l as (
    select o.id as order_id, (o.created_at at time zone 'Asia/Kolkata')::date as day,
           i.product_name,
           i.quantity - coalesce(ir.qty, 0) as q,            -- units the customer kept
           i.quantity - coalesce(ir.restocked, 0) as gone,   -- units that left the shelf for good
           case when o.gst_inclusive then i.unit_price else i.unit_price * (100 + i.gst_rate) / 100 end as sale,
           case when o.gst_inclusive then i.unit_price * 100 / (100 + i.gst_rate) else i.unit_price end as net,
           coalesce(c.unit_cost, vc.cost) as cost,
           -- the GST paid to the supplier and its claimable part, as kept at
           -- sale; older sales (before 0056) fall back to the option's now,
           -- then to an estimate at the selling rate
           case when c.unit_cost is not null then c.unit_gst else vc.gst_paid end as paid,
           case when c.unit_cost is not null then c.unit_itc else vc.gst_claimable end as claim,
           i.gst_rate as rate
      from o
      join public.order_items i on i.order_id = o.id
      left join public.order_item_refunded ir on ir.order_item_id = i.id
      left join public.order_item_costs c on c.order_item_id = i.id
      left join public.variant_costs vc on vc.variant_id = i.variant_id
  ),
  g as (
    select l.*, coalesce(paid, cost * rate / (100 + rate)) as cost_gst from l
  ),
  m as (
    select g.*,
           case when credit then least(coalesce(claim, cost_gst), cost_gst) else 0 end as itc_unit,
           case when cost is null then null
                else cost - case when credit then least(coalesce(claim, cost_gst), cost_gst) else 0 end end as cost_kept
      from g
  ),
  -- goodwill / amount-only refunds per order, with and without GST
  x as (
    select o.id as order_id, (o.created_at at time zone 'Asia/Kolkata')::date as day,
           o.extra * case when o.gst_inclusive or o.subtotal = 0 then 1 else (o.subtotal + o.tax) / o.subtotal end as extra_g,
           o.extra * case when o.gst_inclusive and o.subtotal > 0 then (o.subtotal - o.tax) / o.subtotal else 1 end as extra_ex,
           not exists (select 1 from m where m.order_id = o.id and m.cost is null) as costed
      from o where o.extra <> 0
  ),
  days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  )
  select jsonb_build_object(
    'input_credit', credit,
    'sales', (select round(coalesce(sum(q * sale), 0) - coalesce((select sum(extra_g) from x), 0), 2) from m),
    'net_sales', (select round(coalesce(sum(q * net), 0) - coalesce((select sum(extra_ex) from x), 0), 2) from m),
    'costed_sales', (select round(coalesce(sum(q * sale), 0) - coalesce((select sum(extra_g) from x where costed), 0), 2) from m where cost is not null),
    'cost', (select round(coalesce(sum(gone * cost), 0), 2) from m),
    'profit', (select round(coalesce(sum(q * sale - gone * cost), 0) - coalesce((select sum(extra_g) from x where costed), 0), 2) from m where cost is not null),
    'kept', (select round(coalesce(sum(q * net - gone * cost_kept), 0) - coalesce((select sum(extra_ex) from x where costed), 0), 2) from m where cost is not null),
    -- the same, had nothing been claimed back
    'kept_no_itc', (select round(coalesce(sum(q * net - gone * cost), 0) - coalesce((select sum(extra_ex) from x where costed), 0), 2) from m where cost is not null),
    'uncosted_lines', (select count(*) from m where cost is null and gone > 0),
    'estimated_gst_lines', (select count(*) from m where cost is not null and paid is null and gone > 0),
    'lines', (select count(*) from m where gone > 0),
    'gst_collected', (select coalesce(sum(tax - r_tax), 0) from o),
    'gst_on_top', (select coalesce(sum(tax - r_tax), 0) from o where not gst_inclusive),
    -- GST paid to suppliers on what was sold, and the part claimed back
    'gst_paid', (select round(coalesce(sum(gone * cost_gst), 0), 2) from m where cost is not null),
    'itc', (select round(coalesce(sum(gone * itc_unit), 0), 2) from m where cost is not null),
    'gst_owed', (select round((select coalesce(sum(tax - r_tax), 0) from o) - coalesce(sum(gone * itc_unit), 0), 2) from m where cost is not null),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', days.day, 'profit', round(coalesce(a.p, 0) - coalesce(b.e, 0), 2)) order by days.day), '[]')
        from days
        left join (select day, sum(q * sale - gone * cost) as p from m where cost is not null group by day) a on a.day = days.day
        left join (select day, sum(extra_g) as e from x where costed group by day) b on b.day = days.day),
    'top', (
      select coalesce(jsonb_agg(t), '[]') from (
        select product_name as name, sum(q) as qty, round(sum(q * sale), 2) as sales,
               round(sum(q * sale - gone * cost), 2) as profit
          from m where cost is not null
         group by product_name
        having sum(gone) > 0
         order by 4 desc limit 8) t)
  ) into r;
  return r;
end;
$$;

revoke all on function public.admin_profit(date, date) from public, anon;
grant execute on function public.admin_profit(date, date) to authenticated;

-- ---------------------------------------------------------------- 5. bring existing rows up

-- options fed by posted bills: average the GST off them
do $$
declare v uuid;
begin
  for v in
    select distinct sl.variant_id
      from public.stock_receipt_lines sl join public.stock_receipts r on r.id = sl.receipt_id
     where r.status = 'posted'
  loop
    perform public.recost_variant(v);
  end loop;
end $$;

-- typed ones: work the GST out (the trigger does it)
update public.variant_costs set purchase = purchase where purchase is not null and gst_source = 'typed';
