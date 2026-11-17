-- The rebate on GST paid to suppliers, counted only where it can be claimed;
-- a typed GST amount; and what profit is with and without the claim.
-- Builds on 0057 (accounts accuracy): its GST paid per unit, frozen per sale,
-- its corrections and its paid-only, no-test counting all stay as they are.
--
-- 1. variant_costs.gst_claimable: the part of the GST paid per unit that can
--    be claimed back as input tax credit. Bills: averaged like the GST paid,
--    only the claimable lines (a supplier with a GSTIN) counting; a typed
--    price or correction: all of it. Null: all of the GST paid.
-- 2. recost_variant() (0057's replay) averages it alongside.
-- 3. admin_set_purchase() takes the exact GST amount on the bill, which wins
--    over the rate (a bill that rounds differently).
-- 4. order_item_costs.unit_itc: each sale keeps its claimable part, in the
--    same proportion as 0057 keeps unit_gst.
-- 5. admin_profit() claims back only that part, with input tax credit on in
--    Settings, and reports itc, gst_owed, kept_no_itc, estimated_gst_lines.
--
-- Re-run safe. Needs 0057.

alter table public.variant_costs add column if not exists gst_claimable numeric(10, 2) check (gst_claimable is null or gst_claimable >= 0);
alter table public.order_item_costs add column if not exists unit_itc numeric(10, 2);

-- 0057's four-argument version, now with an optional amount
drop function if exists public.admin_set_purchase(uuid, numeric, numeric, text);

create or replace function public.admin_set_purchase(p_variant uuid, p_purchase numeric, p_gst_rate numeric, p_reason text, p_gst_amount numeric default null)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  why text := left(trim(coalesce(p_reason, '')), 300);
  g numeric;
  c numeric;
begin
  if not public.is_admin() then
    raise exception 'Only the shop can do that.';
  end if;
  if not exists (select 1 from public.product_variants where id = p_variant) then
    raise exception 'Option not found.';
  end if;
  if p_purchase is null or p_purchase < 0 or p_purchase > 10000000 then
    raise exception 'Enter a buying price of 0 or more.';
  end if;
  -- no rate: GST at the product's own rate, following it if the bracket changes
  if p_gst_rate is not null and (p_gst_rate < 0 or p_gst_rate > 100) then
    raise exception 'Enter the GST rate on the bill, 0 to 100%%.';
  end if;
  if length(why) < 3 then
    raise exception 'Say why the price is being corrected.';
  end if;
  if p_gst_amount is not null and (p_gst_amount < 0 or p_gst_amount > p_purchase * 4) then
    raise exception 'Enter the GST paid per piece as on the bill.';
  end if;
  -- the exact amount on the bill wins over the rate (0059)
  g := case when p_gst_amount is not null then round(p_gst_amount, 2)
            when p_gst_rate is null then null else round(p_purchase * p_gst_rate / 100, 2) end;
  insert into public.purchase_corrections (variant_id, purchase, gst_paid, reason, actor_id)
  values (p_variant, round(p_purchase, 2), g, why, (select auth.uid()));
  -- a typed price: all its GST counts as claimable
  insert into public.variant_costs (variant_id, cost, purchase, gst_paid, gst_claimable)
  values (p_variant, 0, round(p_purchase, 2), g, g)
  on conflict (variant_id) do update set purchase = excluded.purchase, gst_paid = excluded.gst_paid, gst_claimable = excluded.gst_claimable
  returning cost into c;
  return c;
end;
$$;

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
begin
  select coalesce(public.product_gst(pv.product_id), 0) into rate from public.product_variants pv where pv.id = p_variant;
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

create or replace function public.order_item_costs_gst()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  vc record;
begin
  if new.unit_gst is null then
    select v.cost, v.gst_paid, v.gst_claimable into vc
      from public.order_items i join public.variant_costs v on v.variant_id = i.variant_id
     where i.id = new.order_item_id;
    if vc.gst_paid is not null and vc.cost > 0 then
      new.unit_gst := round(new.unit_cost * vc.gst_paid / vc.cost, 2);
      -- and the part that can be claimed back, in the same proportion (0059)
      new.unit_itc := round(new.unit_cost * coalesce(vc.gst_claimable, vc.gst_paid) / vc.cost, 2);
    end if;
  end if;
  return new;
end;
$$;

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
     where x.created_at >= t0 and x.created_at < t1 and x.status not in ('cancelled', 'pending') and not x.is_test
  ),
  l as (
    select o.id as order_id, (o.created_at at time zone 'Asia/Kolkata')::date as day,
           i.product_name,
           i.quantity - coalesce(ir.qty, 0) as q,            -- units the customer kept
           i.quantity - coalesce(ir.restocked, 0) as gone,   -- units that left the shelf for good
           case when o.gst_inclusive then i.unit_price else i.unit_price * (100 + i.gst_rate) / 100 end as sale,
           case when o.gst_inclusive then i.unit_price * 100 / (100 + i.gst_rate) else i.unit_price end as net,
           coalesce(c.unit_cost, vc.cost) as cost,
           -- GST inside that cost: as paid on the bills (0057), else at the product's rate
           coalesce(c.unit_gst, case when c.unit_cost is null then vc.gst_paid end) as gst0,
           -- the part of it that can be claimed back (0059): kept at sale, or
           -- the option's now; none known: all of it
           case when c.unit_cost is not null then c.unit_itc else vc.gst_claimable end as itc0,
           i.gst_rate as rate
      from o
      join public.order_items i on i.order_id = o.id
      left join public.order_item_refunded ir on ir.order_item_id = i.id
      left join public.order_item_costs c on c.order_item_id = i.id
      left join public.variant_costs vc on vc.variant_id = i.variant_id
  ),
  g as (
    select l.*, coalesce(gst0, cost * rate / (100 + rate)) as cost_gst from l
  ),
  m as (
    select g.*,
           case when credit then least(coalesce(itc0, cost_gst), cost_gst) else 0 end as itc_unit,
           case when cost is null then null
                else cost - case when credit then least(coalesce(itc0, cost_gst), cost_gst) else 0 end end as cost_kept
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
    -- the same, had nothing been claimed back (0059)
    'kept_no_itc', (select round(coalesce(sum(q * net - gone * cost), 0) - coalesce((select sum(extra_ex) from x where costed), 0), 2) from m where cost is not null),
    'uncosted_lines', (select count(*) from m where cost is null and gone > 0),
    'estimated_gst_lines', (select count(*) from m where cost is not null and gst0 is null and gone > 0),
    'lines', (select count(*) from m where gone > 0),
    'gst_collected', (select coalesce(sum(tax - r_tax), 0) from o),
    'gst_on_top', (select coalesce(sum(tax - r_tax), 0) from o where not gst_inclusive),
    -- GST inside the cost of what was sold (claimed back only when credit is on)
    'gst_paid', (select round(coalesce(sum(gone * cost_gst), 0), 2) from m where cost is not null),
    -- of that, claimed back, and the GST left to pay over (0059)
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

revoke all on function public.admin_set_purchase(uuid, numeric, numeric, text, numeric) from public, anon;
grant execute on function public.admin_set_purchase(uuid, numeric, numeric, text, numeric) to authenticated;
revoke all on function public.recost_variant(uuid) from public, anon, authenticated;
revoke all on function public.order_item_costs_gst() from public, anon, authenticated;
revoke all on function public.admin_profit(date, date) from public, anon;
grant execute on function public.admin_profit(date, date) to authenticated;

-- bring the claimable part in for options fed by posted bills
do $$
declare v uuid;
begin
  for v in
    select distinct sl.variant_id from public.stock_receipt_lines sl
      join public.stock_receipts r on r.id = sl.receipt_id where r.status = 'posted'
  loop
    perform public.recost_variant(v);
  end loop;
end $$;
