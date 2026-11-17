-- CESS: an optional tax on top of GST, per product, off by default.
--
-- Some goods (tobacco among them) carry a compensation cess besides GST. The
-- shop switches it on in Settings (store_settings.cess_enabled); each product
-- then has its own cess rate (products.cess_rate, a percent of the taxable
-- value, 0 = none). Specific cess (rupees per thousand sticks) is not
-- modelled: a percent only.
--
-- Cess sits on the same taxable value as GST:
--   inclusive pricing  shelf price = taxable + GST + cess
--                      GST  = gross x gst  / (100 + gst + cess)
--                      cess = gross x cess / (100 + gst + cess)
--   exclusive pricing  GST  = gross x gst  / 100, cess = gross x cess / 100,
--                      both added at checkout
-- With no cess the GST is worked out exactly as before (line_gst), so with
-- the switch off nothing changes, to the paisa.
--
-- 1. columns: the switch, each product's rate, and each order line's rate and
--    cess (kept at sale), the order's cess, a refund's and a credit note's
-- 2. an order line takes its product's cess rate when the switch is on
-- 3. line_gst_c() / line_cess(): GST and cess on a line
-- 4. order_retax(): tax and cess, the total with both
-- 5. refunds: refund_taxes() gives GST and cess (refund_tax() keeps giving
--    GST), the refund and its credit note keep both
-- 6. admin_profit(): the sale without GST and cess; cess collected
--
-- Re-run safe. Needs 0057 and 0059.

-- ---------------------------------------------------------------- 1. columns

alter table public.store_settings add column if not exists cess_enabled boolean not null default false;

alter table public.products add column if not exists cess_rate numeric(5, 2) not null default 0;
alter table public.products drop constraint if exists products_cess_rate_check;
alter table public.products add constraint products_cess_rate_check check (cess_rate between 0 and 400);

alter table public.order_items add column if not exists cess_rate numeric(5, 2) not null default 0;
alter table public.order_items add column if not exists cess numeric(10, 2) not null default 0;
alter table public.orders add column if not exists cess numeric(10, 2) not null default 0;
alter table public.order_refunds add column if not exists cess numeric(10, 2) not null default 0;
alter table public.credit_notes add column if not exists cess numeric(10, 2) not null default 0;

-- ---------------------------------------------------------------- 2. at sale

create or replace function public.order_items_set_cess()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cess_rate = 0 and new.variant_id is not null
     and coalesce((select st.cess_enabled from public.store_settings st where st.id = 1), false) then
    select p.cess_rate into new.cess_rate
      from public.product_variants pv join public.products p on p.id = pv.product_id
     where pv.id = new.variant_id;
    new.cess_rate := coalesce(new.cess_rate, 0);
  end if;
  return new;
end;
$$;
revoke all on function public.order_items_set_cess() from public, anon, authenticated;

drop trigger if exists order_items_set_cess on public.order_items;
create trigger order_items_set_cess before insert on public.order_items
  for each row execute function public.order_items_set_cess();

-- ---------------------------------------------------------------- 3. on a line

create or replace function public.line_gst_c(gross numeric, rate numeric, cess numeric, incl boolean)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(cess, 0) = 0 then public.line_gst(gross, rate, incl)
              when incl then round(gross * rate / (100 + rate + cess), 2)
              else round(gross * rate / 100, 2) end
$$;

create or replace function public.line_cess(gross numeric, rate numeric, cess numeric, incl boolean)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(cess, 0) = 0 then 0
              when incl then round(gross * cess / (100 + rate + cess), 2)
              else round(gross * cess / 100, 2) end
$$;

-- ---------------------------------------------------------------- 4. an order

create or replace function public.order_retax(p_order uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t numeric;
  c numeric;
  one numeric;
  incl boolean;
begin
  select o.gst_inclusive into incl from public.orders o where o.id = p_order;
  update public.order_items i
     set cess = public.line_cess(i.quantity * i.unit_price, i.gst_rate, i.cess_rate, incl)
   where i.order_id = p_order
     and i.cess is distinct from public.line_cess(i.quantity * i.unit_price, i.gst_rate, i.cess_rate, incl);
  select coalesce(sum(public.line_gst_c(i.quantity * i.unit_price, i.gst_rate, i.cess_rate, incl)), 0),
         coalesce(sum(i.cess), 0),
         case when count(distinct i.gst_rate) = 1 then max(i.gst_rate) end
    into t, c, one
    from public.order_items i
   where i.order_id = p_order;
  update public.orders
     set tax = coalesce(t, 0),
         cess = coalesce(c, 0),
         total = subtotal + shipping + case when gst_inclusive then 0 else coalesce(t, 0) + coalesce(c, 0) end,
         gst_rate = one
   where id = p_order;
end;
$$;
revoke all on function public.order_retax(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- 5. refunds

-- GST and cess in one refund, line by line: the refunded items at their own
-- rates (scaled down when less than their value was returned), and anything
-- over that (goodwill) spread over the order's rates, with tax inside. The
-- same steps as 0051's refund_tax(), each rate now a pair (GST, cess).
create or replace function public.refund_taxes(p_refund uuid, out gst numeric, out cess numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  f record;
  o record;
  rest numeric;
  w numeric;
  k numeric;
  extra numeric;
  tot numeric;
  acc numeric := 0;
  part numeric;
  nr int;
  idx int := 0;
  g record;
begin
  gst := 0;
  cess := 0;
  select * into f from public.order_refunds where id = p_refund;
  if not found then
    return;
  end if;
  select * into o from public.orders where id = f.order_id;
  rest := f.amount - f.shipping;
  -- refunded items' value with tax
  select coalesce(sum(case when o.gst_inclusive then ri.quantity * i.unit_price
                           else ri.quantity * i.unit_price
                                + public.line_gst_c(ri.quantity * i.unit_price, coalesce(i.gst_rate, o.gst_rate, 0), i.cess_rate, false)
                                + public.line_cess(ri.quantity * i.unit_price, coalesce(i.gst_rate, o.gst_rate, 0), i.cess_rate, false) end), 0)
    into w
    from public.order_refund_items ri join public.order_items i on i.id = ri.order_item_id
   where ri.refund_id = f.id;
  if w > 0 and rest < w then
    k := rest / w;
    select coalesce(sum(public.line_gst_c(round(ri.quantity * i.unit_price * k, 2), coalesce(i.gst_rate, o.gst_rate, 0), i.cess_rate, o.gst_inclusive)), 0),
           coalesce(sum(public.line_cess(round(ri.quantity * i.unit_price * k, 2), coalesce(i.gst_rate, o.gst_rate, 0), i.cess_rate, o.gst_inclusive)), 0)
      into gst, cess
      from public.order_refund_items ri join public.order_items i on i.id = ri.order_item_id
     where ri.refund_id = f.id;
    return;
  end if;
  select coalesce(sum(public.line_gst_c(ri.quantity * i.unit_price, coalesce(i.gst_rate, o.gst_rate, 0), i.cess_rate, o.gst_inclusive)), 0),
         coalesce(sum(public.line_cess(ri.quantity * i.unit_price, coalesce(i.gst_rate, o.gst_rate, 0), i.cess_rate, o.gst_inclusive)), 0)
    into gst, cess
    from public.order_refund_items ri join public.order_items i on i.id = ri.order_item_id
   where ri.refund_id = f.id;
  extra := rest - w;
  if extra > 0 then
    select sum(x.gw), count(*) into tot, nr from (
      select sum(case when o.gst_inclusive then i.quantity * i.unit_price
                      else i.quantity * i.unit_price
                           + public.line_gst_c(i.quantity * i.unit_price, coalesce(i.gst_rate, o.gst_rate, 0), i.cess_rate, false)
                           + public.line_cess(i.quantity * i.unit_price, coalesce(i.gst_rate, o.gst_rate, 0), i.cess_rate, false) end) as gw
        from public.order_items i where i.order_id = o.id group by coalesce(i.gst_rate, o.gst_rate, 0), i.cess_rate) x;
    if coalesce(tot, 0) <= 0 then
      return;
    end if;
    for g in
      select coalesce(i.gst_rate, o.gst_rate, 0) as rate, i.cess_rate as crate,
             sum(case when o.gst_inclusive then i.quantity * i.unit_price
                      else i.quantity * i.unit_price
                           + public.line_gst_c(i.quantity * i.unit_price, coalesce(i.gst_rate, o.gst_rate, 0), i.cess_rate, false)
                           + public.line_cess(i.quantity * i.unit_price, coalesce(i.gst_rate, o.gst_rate, 0), i.cess_rate, false) end) as gw
        from public.order_items i where i.order_id = o.id
       group by 1, 2 order by 1, 2
    loop
      idx := idx + 1;
      part := case when idx = nr then extra - acc else round(extra * g.gw / tot, 2) end;
      acc := acc + part;
      -- the credit includes its tax, whatever the order's pricing
      gst := gst + public.line_gst_c(part, g.rate, g.crate, true);
      cess := cess + public.line_cess(part, g.rate, g.crate, true);
    end loop;
  end if;
end;
$$;
revoke all on function public.refund_taxes(uuid) from public, anon, authenticated;

-- GST only, as before (credit notes, returns and reports read it)
create or replace function public.refund_tax(p_refund uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select (public.refund_taxes(p_refund)).gst
$$;
revoke all on function public.refund_tax(uuid) from public, anon, authenticated;

create or replace function public.issue_credit_note(p_refund uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  x record;
  fy text := public.current_fy();
begin
  select f.id, f.order_id, f.amount, f.shipping into r
    from public.order_refunds f join public.orders o on o.id = f.order_id
   where f.id = p_refund and o.invoice_number is not null
     and not exists (select 1 from public.credit_notes c where c.refund_id = f.id);
  if not found then
    return;
  end if;
  x := public.refund_taxes(r.id);
  insert into public.credit_notes (number, order_id, refund_id, amount, tax, cess, shipping)
  values ('CN/' || fy || '/' || public.next_doc_number('CN-' || fy), r.order_id, r.id, r.amount, x.gst, x.cess, r.shipping);
end;
$$;
revoke all on function public.issue_credit_note(uuid) from public, anon, authenticated;

create or replace function public.order_refunds_settle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  x record;
  incl boolean;
begin
  perform 1 from public.order_refunds where id = new.id;
  if not found then
    return null;
  end if;
  x := public.refund_taxes(new.id);
  select o.gst_inclusive into incl from public.orders o where o.id = new.order_id;
  update public.order_refunds
     set tax = x.gst, cess = x.cess,
         subtotal = case when incl then amount - shipping else amount - shipping - x.gst - x.cess end
   where id = new.id and (tax is distinct from x.gst or cess is distinct from x.cess);
  perform public.issue_credit_note(new.id);
  return null;
end;
$$;

-- refund totals per order, with the cess refunded (added last, so the view's
-- earlier columns keep their places)
create or replace view public.order_refund_totals as
select r.order_id,
       sum(r.amount) as amount,
       sum(r.subtotal) as subtotal,
       sum(r.shipping) as shipping,
       sum(r.tax) as tax,
       sum(r.subtotal) - coalesce(sum((select sum(ri.quantity * i.unit_price)
                                         from public.order_refund_items ri
                                         join public.order_items i on i.id = ri.order_item_id
                                        where ri.refund_id = r.id)), 0) as extra,
       sum(r.cess) as cess
  from public.order_refunds r
 group by r.order_id;

-- ---------------------------------------------------------------- 6. profit

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
    select x.*, coalesce(rt.tax, 0) as r_tax, coalesce(rt.cess, 0) as r_cess, coalesce(rt.extra, 0) as extra
      from public.orders x left join public.order_refund_totals rt on rt.order_id = x.id
     where x.created_at >= t0 and x.created_at < t1 and x.status not in ('cancelled', 'pending') and not x.is_test
  ),
  l as (
    select o.id as order_id, (o.created_at at time zone 'Asia/Kolkata')::date as day,
           i.product_name,
           i.quantity - coalesce(ir.qty, 0) as q,            -- units the customer kept
           i.quantity - coalesce(ir.restocked, 0) as gone,   -- units that left the shelf for good
           -- with GST and cess, and without either (0060)
           case when o.gst_inclusive then i.unit_price else i.unit_price * (100 + i.gst_rate + i.cess_rate) / 100 end as sale,
           case when o.gst_inclusive then i.unit_price * 100 / (100 + i.gst_rate + i.cess_rate) else i.unit_price end as net,
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
           o.extra * case when o.gst_inclusive or o.subtotal = 0 then 1 else (o.subtotal + o.tax + o.cess) / o.subtotal end as extra_g,
           o.extra * case when o.gst_inclusive and o.subtotal > 0 then (o.subtotal - o.tax - o.cess) / o.subtotal else 1 end as extra_ex,
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
    -- cess collected (0060), paid over in full: none claimed back here
    'cess_collected', (select coalesce(sum(cess - r_cess), 0) from o),
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

revoke all on function public.admin_profit(date, date) from public, anon;
grant execute on function public.admin_profit(date, date) to authenticated;
