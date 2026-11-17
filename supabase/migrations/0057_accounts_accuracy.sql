-- Accounts the shop can trust (before the client's data manager runs them).
-- 1. Correcting a buying price: admin_set_purchase(option, price before GST,
--    GST rate paid (null: the product's own rate), reason). A price typed in
--    the product panel goes through it too. The reason is required and kept in
--    purchase_corrections (and the change in the activity log). A correction
--    is a fresh starting point for the running average: later bills average
--    against it, and recost_variant() (after a bill is cancelled) replays
--    from it instead of losing it. Every option's current price is recorded
--    as its starting point now, so nothing moves when this is applied.
-- 2. Cost from the bill: variant_costs.gst_paid is the GST actually paid per
--    unit, averaged across bills like the price. Cost = price + gst_paid, so
--    a product bought at 18% and sold at 40% is costed at 18%. Options with no
--    bill (a typed price) still use the product's own rate. Each sale freezes
--    its GST share in order_item_costs.unit_gst, and profit with input tax
--    credit takes back exactly that.
-- 3, 4. Sales, profit, analytics and reports count paid orders only (manual
--    payment: an unpaid order isn't a sale yet) and never test orders.

-- ---------------------------------------------------------------- 2. GST paid per unit
alter table public.variant_costs add column if not exists gst_paid numeric(10, 2) check (gst_paid is null or gst_paid >= 0);

create or replace function public.variant_costs_from_purchase()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.purchase is not null then
    new.cost := new.purchase + coalesce(new.gst_paid, round(new.purchase * coalesce(
      (select public.product_gst(pv.product_id) from public.product_variants pv where pv.id = new.variant_id), 0) / 100, 2));
  end if;
  return new;
end;
$$;

-- each sale keeps the GST share of its frozen cost
alter table public.order_item_costs add column if not exists unit_gst numeric(10, 2);
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
    select v.cost, v.gst_paid into vc
      from public.order_items i join public.variant_costs v on v.variant_id = i.variant_id
     where i.id = new.order_item_id;
    if vc.gst_paid is not null and vc.cost > 0 then
      new.unit_gst := round(new.unit_cost * vc.gst_paid / vc.cost, 2);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.order_item_costs_gst() from public, anon, authenticated;
drop trigger if exists order_item_costs_gst on public.order_item_costs;
create trigger order_item_costs_gst before insert on public.order_item_costs
  for each row execute function public.order_item_costs_gst();

-- ---------------------------------------------------------------- 1. corrections
create table if not exists public.purchase_corrections (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  purchase numeric(10, 2) not null check (purchase >= 0),
  gst_paid numeric(10, 2) check (gst_paid is null or gst_paid >= 0),
  reason text not null default '',
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists purchase_corrections_variant_idx on public.purchase_corrections (variant_id, created_at);
alter table public.purchase_corrections enable row level security;
drop policy if exists "admins read purchase corrections" on public.purchase_corrections;
create policy "admins read purchase corrections" on public.purchase_corrections for select to authenticated using (public.is_admin());
revoke all on public.purchase_corrections from anon, authenticated;
grant select on public.purchase_corrections to authenticated;

-- today's prices are everyone's starting point (gst_paid from the bills where there are any)
insert into public.purchase_corrections (variant_id, purchase, gst_paid, reason)
select vc.variant_id, vc.purchase,
       -- the bills' own GST rate, applied to today's average price
       (select round(vc.purchase * sum(l.gst) / nullif(sum(l.qty * l.unit_price), 0), 2)
          from public.stock_receipt_lines l join public.stock_receipts r on r.id = l.receipt_id
         where l.variant_id = vc.variant_id and r.status = 'posted'),
       'Starting point (0057)'
  from public.variant_costs vc
 where vc.purchase is not null
   and not exists (select 1 from public.purchase_corrections pc where pc.variant_id = vc.variant_id);
update public.variant_costs vc set gst_paid = pc.gst_paid
  from public.purchase_corrections pc
 where pc.variant_id = vc.variant_id and pc.reason = 'Starting point (0057)' and pc.gst_paid is not null;

create or replace function public.admin_set_purchase(p_variant uuid, p_purchase numeric, p_gst_rate numeric, p_reason text)
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
  g := case when p_gst_rate is null then null else round(p_purchase * p_gst_rate / 100, 2) end;
  insert into public.purchase_corrections (variant_id, purchase, gst_paid, reason, actor_id)
  values (p_variant, round(p_purchase, 2), g, why, (select auth.uid()));
  insert into public.variant_costs (variant_id, cost, purchase, gst_paid)
  values (p_variant, 0, round(p_purchase, 2), g)
  on conflict (variant_id) do update set purchase = excluded.purchase, gst_paid = excluded.gst_paid
  returning cost into c;
  return c;
end;
$$;
revoke all on function public.admin_set_purchase(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.admin_set_purchase(uuid, numeric, numeric, text) to authenticated;

-- every bill posted re-runs the average, so bills and corrections agree
create or replace function public.stock_in_recost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reason = 'stock_in' then
    perform public.recost_variant(new.variant_id);
  end if;
  return null;
end;
$$;
revoke all on function public.stock_in_recost() from public, anon, authenticated;
drop trigger if exists stock_in_recost on public.stock_movements;
create trigger stock_in_recost after insert on public.stock_movements
  for each row execute function public.stock_in_recost();


-- ---------------------------------------------------------------- 1. the average, replayed
-- Replays an option's buying price and GST paid from its posted bills, in
-- time order, starting again at each correction (0057). Same running average
-- as admin_post_receipt: new = (stock before * old + bill qty * bill price) /
-- (stock before + bill qty).
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
      select sl.receipt_id, sl.qty, sl.unit_price, sl.gst,
             row_number() over (partition by sl.receipt_id order by sl.created_at, sl.id) rn
        from public.stock_receipt_lines sl
       where sl.variant_id = p_variant)
    select mv.created_at, mv.id, mv.delta, mv.qty_after, mv.receipt_id,
           coalesce(mv.reason = 'stock_in' and r.status = 'posted' and ln.qty is not null, false) as live,
           ln.qty, ln.unit_price, ln.gst, false as fix, null::numeric as fix_price, null::numeric as fix_gst
      from mv
      left join public.stock_receipts r on r.id = mv.receipt_id
      left join ln on ln.receipt_id = mv.receipt_id and ln.rn = mv.rn and mv.reason = 'stock_in'
    union all
    select pc.created_at, pc.id, 0, 0, null, false, null, null, null, true, pc.purchase, pc.gst_paid
      from public.purchase_corrections pc
     where pc.variant_id = p_variant
     order by 1, 2
  loop
    if m.live and g_receipt is not distinct from m.receipt_id then
      g_qty := g_qty + m.qty;
      g_sum := g_sum + m.qty * m.unit_price;
      g_gst := g_gst + coalesce(m.gst, 0);
      continue;
    end if;
    if g_receipt is not null then
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
      seen := true;
    elsif m.live then
      g_receipt := m.receipt_id;
      g_stock := greatest(m.qty_after - m.delta, 0);
      g_qty := m.qty;
      g_sum := m.qty * m.unit_price;
      g_gst := coalesce(m.gst, 0);
    end if;
  end loop;
  if g_receipt is not null then
    avg_g := round(case when avg is null then g_gst / g_qty
                        else (g_stock * coalesce(avg_g, avg * rate / 100) + g_gst) / (g_stock + g_qty) end, 2);
    avg := round(case when avg is null then g_sum / g_qty
                      else (g_stock * avg + g_sum) / (g_stock + g_qty) end, 2);
    seen := true;
  end if;
  if not seen then
    return;
  end if;
  insert into public.variant_costs (variant_id, cost, purchase, gst_paid)
  values (p_variant, 0, avg, avg_g)
  on conflict (variant_id) do update set purchase = excluded.purchase, gst_paid = excluded.gst_paid;
end;
$$;


-- ---------------------------------------------------------------- 2-4. profit (from 0030)
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
           i.gst_rate as rate
      from o
      join public.order_items i on i.order_id = o.id
      left join public.order_item_refunded ir on ir.order_item_id = i.id
      left join public.order_item_costs c on c.order_item_id = i.id
      left join public.variant_costs vc on vc.variant_id = i.variant_id
  ),
  m as (
    select l.*,
           coalesce(gst0, cost * rate / (100 + rate)) as cost_gst,
           case when cost is null then null
                when credit then cost - coalesce(gst0, cost * rate / (100 + rate)) else cost end as cost_kept
      from l
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
    'uncosted_lines', (select count(*) from m where cost is null and gone > 0),
    'lines', (select count(*) from m where gone > 0),
    'gst_collected', (select coalesce(sum(tax - r_tax), 0) from o),
    'gst_on_top', (select coalesce(sum(tax - r_tax), 0) from o where not gst_inclusive),
    -- GST inside the cost of what was sold (claimed back only when credit is on)
    'gst_paid', (select round(coalesce(sum(gone * cost_gst), 0), 2) from m where cost is not null),
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

-- ---------------------------------------------------------------- 2-4. reports (from 0030)
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
    with sold as (
      select i.variant_id, sum(i.quantity - coalesce(ir.qty, 0)) as q
        from public.orders o join public.order_items i on i.order_id = o.id
        left join public.order_item_refunded ir on ir.order_item_id = i.id
       where o.created_at >= t0 and o.created_at < t1 and o.status not in ('cancelled', 'pending') and not o.is_test
       group by i.variant_id
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

-- ---------------------------------------------------------------- 3, 4. analytics (from 0017)
create or replace function public.admin_analytics(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t0 timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  t1 timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  with o as (
    select x.*, coalesce(rt.subtotal, 0) as r_sub, coalesce(rt.shipping, 0) as r_ship, coalesce(rt.tax, 0) as r_tax
      from public.orders x left join public.order_refund_totals rt on rt.order_id = x.id
     where x.created_at >= t0 and x.created_at < t1 and x.status not in ('cancelled', 'pending') and not x.is_test
  ),
  days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  ),
  daily as (
    select days.day,
           coalesce(sum(o.subtotal), 0) as gross,
           count(o.id) as orders
      from days left join o on (o.created_at at time zone 'Asia/Kolkata')::date = days.day
     group by days.day
  ),
  buyers as (
    select o.profile_id,
           exists (select 1 from public.orders p
                    where p.profile_id = o.profile_id and p.created_at < t0 and p.status not in ('cancelled', 'pending') and not p.is_test) as before,
           count(*) as n
      from o where o.profile_id is not null group by o.profile_id
  ),
  ev as (
    select * from public.site_events where created_at >= t0 and created_at < t1
  )
  select jsonb_build_object(
    'orders', (select count(*) from o),
    'items', (select coalesce(sum(i.quantity), 0) from public.order_items i join o on o.id = i.order_id),
    'gross', (select coalesce(sum(subtotal), 0) from o),
    'returns', (select coalesce(sum(r_sub), 0) from o),
    'shipping', (select coalesce(sum(shipping - r_ship), 0) from o),
    'tax', (select coalesce(sum(tax - r_tax), 0) from o),
    'fulfilled', (select count(*) from o where status in ('shipped', 'delivered')),
    'customers', (select count(*) from buyers),
    'returning', (select count(*) from buyers where before or n > 1),
    'cancelled', (select count(*) from public.orders where created_at >= t0 and created_at < t1 and status = 'cancelled' and not is_test),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'gross', gross, 'orders', orders) order by day), '[]') from daily),
    'top_products', (
      select coalesce(jsonb_agg(x), '[]') from (
        select i.product_name as name,
               sum(i.quantity - coalesce(ir.qty, 0)) as qty,
               sum((i.quantity - coalesce(ir.qty, 0)) * i.unit_price) as sales
          from public.order_items i join o on o.id = i.order_id
          left join public.order_item_refunded ir on ir.order_item_id = i.id
         group by i.product_name
        having sum(i.quantity - coalesce(ir.qty, 0)) > 0
         order by sales desc limit 8) x),
    'by_state', (
      select coalesce(jsonb_agg(x), '[]') from (
        select address_state as name, count(*) as orders, sum(subtotal - r_sub) as sales
          from o group by address_state order by sales desc limit 6) x),
    'sessions', (select count(distinct session_id) from ev),
    'views', (select count(*) from ev where kind = 'view'),
    'cart_sessions', (select count(distinct session_id) from ev where kind = 'cart'),
    'checkout_sessions', (select count(distinct session_id) from ev where kind = 'checkout'),
    'daily_sessions', (
      select coalesce(jsonb_agg(jsonb_build_object('day', days.day, 'sessions', coalesce(x.n, 0)) order by days.day), '[]')
        from days left join (
          select (created_at at time zone 'Asia/Kolkata')::date as day, count(distinct session_id) as n
            from ev group by 1) x on x.day = days.day),
    'devices', (
      select coalesce(jsonb_agg(x), '[]') from (
        select coalesce(nullif(device, ''), 'unknown') as name, count(distinct session_id) as sessions
          from ev group by 1 order by 2 desc) x),
    'referrers', (
      select coalesce(jsonb_agg(x), '[]') from (
        select coalesce(nullif(referrer, ''), 'Direct') as name, count(distinct session_id) as sessions
          from ev where kind = 'view' group by 1 order by 2 desc limit 6) x),
    'pages', (
      select coalesce(jsonb_agg(x), '[]') from (
        select path as name, count(*) as views from ev where kind = 'view' group by 1 order by 2 desc limit 6) x)
  ) into r;
  return r;
end;
$$;

-- ---------------------------------------------------------------- 3, 4. sales by category (from 0035)
create or replace function public.admin_sales_by_category(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t0 timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  t1 timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(x order by x.sales desc), '[]') into r from (
    select coalesce(c.name, 'Other') as name,
           coalesce(c.slug, '') as slug,
           sum(i.quantity - coalesce(ir.qty, 0)) as qty,
           sum((i.quantity - coalesce(ir.qty, 0)) * i.unit_price) as sales
      from public.order_items i
      join public.orders o on o.id = i.order_id
       and o.created_at >= t0 and o.created_at < t1 and o.status not in ('cancelled', 'pending') and not o.is_test
      left join public.order_item_refunded ir on ir.order_item_id = i.id
      left join public.product_variants v on v.id = i.variant_id
      left join public.products p on p.id = v.product_id
      left join public.categories c on c.id = p.category_id
     group by c.name, c.slug
    having sum(i.quantity - coalesce(ir.qty, 0)) > 0
  ) x;
  return r;
end;
$$;

-- ---------------------------------------------------------------- 3, 4. customer map (from 0025)
create or replace function public.admin_geo(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t0 timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  t1 timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  with o as (
    select x.*, coalesce(rt.subtotal, 0) as r_sub
      from public.orders x left join public.order_refund_totals rt on rt.order_id = x.id
     where x.created_at >= t0 and x.created_at < t1 and x.status not in ('cancelled', 'pending') and not x.is_test
  ),
  c as (
    select initcap(lower(trim(address_city))) as city, trim(address_state) as state,
           count(distinct coalesce(profile_id::text, contact_email)) as customers,
           count(*) as orders,
           sum(subtotal - r_sub) as sales,
           avg(address_latitude) as lat, avg(address_longitude) as lng
      from o group by 1, 2
  )
  select jsonb_build_object(
    'cities', (select coalesce(jsonb_agg(c order by c.sales desc), '[]') from c),
    'customers', (select count(distinct coalesce(profile_id::text, contact_email)) from o)
  ) into r;
  return r;
end;
$$;

-- ---------------------------------------------------------------- 3, 4. sales by age (from 0047)
create or replace function public.admin_sales_by_age(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t0 timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  t1 timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
  bands jsonb;
  accounts jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x order by x.sort), '[]') into bands from (
    select b.band, b.sort,
           count(distinct coalesce(o.profile_id::text, lower(o.contact_email))) as buyers,
           count(*) as orders,
           sum(o.total) as sales
      from public.orders o
      left join public.profiles p on p.id = o.profile_id
      cross join lateral public.age_band(p.date_of_birth) b
     where o.created_at >= t0 and o.created_at < t1
       and o.status not in ('cancelled', 'refunded', 'pending') and not o.is_test
       and not coalesce(p.hidden, false)
     group by b.band, b.sort
  ) x;

  select coalesce(jsonb_agg(y order by y.sort), '[]') into accounts from (
    select b.band, b.sort, count(*) as n
      from public.profiles p
      cross join lateral public.age_band(p.date_of_birth) b
     where p.role = 'customer' and not p.hidden
     group by b.band, b.sort
  ) y;

  return jsonb_build_object('bands', bands, 'accounts', accounts);
end;
$$;
