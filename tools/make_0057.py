"""Builds supabase/migrations/0057_accounts_accuracy.sql.

The money functions are long and were last defined in different migrations;
rather than retyping them, this takes each one's latest definition and makes
the same targeted changes:
  * sales, profit and reports count only paid, real orders: "pending" (not
    paid yet, manual payment) and test orders are left out;
  * the GST inside a cost is the GST actually paid on the supplier bills
    (frozen per sale in order_item_costs.unit_gst), not the product's rate.
Run: python tools/make_0057.py   (writes the migration; the hand-written parts
are in HEAD below).
"""
import re
from pathlib import Path

M = Path(__file__).resolve().parent.parent / "supabase" / "migrations"


def latest(fn: str) -> str:
    """The last `create or replace function public.<fn>(` ... `$$;` in the migrations."""
    found = ""
    for f in sorted(M.glob("0*.sql")):
        if f.name.startswith("0057"):
            continue
        t = f.read_text(encoding="utf-8")
        for m in re.finditer(rf"create or replace function public\.{fn}\(.*?\n\$\$;", t, re.S):
            found = m.group(0)
    assert found, fn
    return found


def must(s: str, a: str, b: str, n: int = 1) -> str:
    assert s.count(a) == n, (a, s.count(a))
    return s.replace(a, b)


def paid_only(s: str) -> str:
    """status <> 'cancelled' -> also not pending, not a test order (keeps the alias)."""
    s2 = re.sub(r"\b(\w+\.)?status <> 'cancelled'", lambda m: f"{m.group(1) or ''}status not in ('cancelled', 'pending') and not {m.group(1) or ''}is_test", s)
    s2 = s2.replace("o.status not in ('cancelled', 'refunded')", "o.status not in ('cancelled', 'refunded', 'pending') and not o.is_test")
    assert s2 != s
    return s2


HEAD = r"""-- Accounts the shop can trust (before the client's data manager runs them).
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
"""

RECOST = r"""-- Replays an option's buying price and GST paid from its posted bills, in
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
"""


def profit() -> str:
    s = paid_only(latest("admin_profit"))
    s = must(s, "           coalesce(c.unit_cost, vc.cost) as cost,\n",
             "           coalesce(c.unit_cost, vc.cost) as cost,\n"
             "           -- GST inside that cost: as paid on the bills (0057), else at the product's rate\n"
             "           coalesce(c.unit_gst, case when c.unit_cost is null then vc.gst_paid end) as gst0,\n")
    s = must(s, "cost * rate / (100 + rate) as cost_gst,", "coalesce(gst0, cost * rate / (100 + rate)) as cost_gst,")
    s = must(s, "when credit then cost * 100 / (100 + rate) else cost end as cost_kept",
             "when credit then cost - coalesce(gst0, cost * rate / (100 + rate)) else cost end as cost_kept")
    return s


def report() -> str:
    s = paid_only(latest("admin_report"))
    s = must(s, "             coalesce(oc.unit_cost, vc.cost) as cost, i.gst_rate as rate\n",
             "             coalesce(oc.unit_cost, vc.cost) as cost, i.gst_rate as rate,\n"
             "             coalesce(oc.unit_gst, case when oc.unit_cost is null then vc.gst_paid end) as gst0\n")
    s = must(s, "sum(gone * cost * rate / (100 + rate)) filter (where credit) as gst_paid,",
             "sum(gone * coalesce(gst0, cost * rate / (100 + rate))) filter (where credit) as gst_paid,")
    return s


def analytics() -> str:
    s = paid_only(latest("admin_analytics"))
    return must(s, "where created_at >= t0 and created_at < t1 and status = 'cancelled'),",
                "where created_at >= t0 and created_at < t1 and status = 'cancelled' and not is_test),")


parts = [
    HEAD,
    "-- ---------------------------------------------------------------- 1. the average, replayed\n" + RECOST,
    "-- ---------------------------------------------------------------- 2-4. profit (from 0030)\n" + profit(),
    "-- ---------------------------------------------------------------- 2-4. reports (from 0030)\n" + report(),
    "-- ---------------------------------------------------------------- 3, 4. analytics (from 0017)\n" + analytics(),
    "-- ---------------------------------------------------------------- 3, 4. sales by category (from 0035)\n" + paid_only(latest("admin_sales_by_category")),
    "-- ---------------------------------------------------------------- 3, 4. customer map (from 0025)\n" + paid_only(latest("admin_geo")),
    "-- ---------------------------------------------------------------- 3, 4. sales by age (from 0047)\n" + paid_only(latest("admin_sales_by_age")),
]
out = M / "0057_accounts_accuracy.sql"
out.write_text("\n\n".join(parts) + "\n", encoding="utf-8", newline="\n")
print(out, sum(len(p) for p in parts))
