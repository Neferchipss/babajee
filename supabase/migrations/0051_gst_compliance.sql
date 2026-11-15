-- 0051 GST compliance for a regular GST-registered shop.
--
-- 1. GST on shipping. Shipping charged to the customer is part of the
--    supply, taxed at the highest GST rate among the order's items. With
--    GST-inclusive prices the charge stays the same and its GST is counted
--    inside it; with exclusive prices the GST is added on top. Only orders
--    placed from now on (orders.shipping_taxed): invoices already issued
--    never change.
-- 2. The buyer's GSTIN on an order (B2B), set by the shop before the
--    invoice is issued, printed on the invoice and reported in GSTR-1.
-- 3. Credit notes: a numbered document for each refund on an invoiced
--    order (own series per financial year, e.g. BJ-CN/26-27/0001), with the
--    refund's total and GST kept as they were when issued.
-- 4. Purchase bills: "in GSTR-2B" and "paid on" ticks. Input tax credit
--    counts only bills ticked as in GSTR-2B; bills unpaid 180 days after
--    their date are listed so the credit can be reversed.
--
-- Depends on 0050. Safe to re-run.

-- ---------------------------------------------------------------- 1. shipping GST

alter table public.orders add column if not exists shipping_taxed boolean not null default false;
-- existing orders keep false; every order from now on is taxed
alter table public.orders alter column shipping_taxed set default true;

-- the GST inside (or on top of) an order's shipping charge
create or replace function public.shipping_gst(p_order uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
           when not o.shipping_taxed or o.shipping <= 0 then 0
           else public.line_gst(o.shipping, coalesce((select max(i.gst_rate) from public.order_items i where i.order_id = o.id), 0), o.gst_inclusive)
         end
    from public.orders o
   where o.id = p_order;
$$;
revoke all on function public.shipping_gst(uuid) from public, anon;
grant execute on function public.shipping_gst(uuid) to authenticated;

-- 0030's order_retax, with the shipping GST added to the order's tax
create or replace function public.order_retax(p_order uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t numeric;
  one numeric;
  s numeric;
begin
  select coalesce(sum(public.line_gst(i.quantity * i.unit_price, i.gst_rate, o.gst_inclusive)), 0),
         case when count(distinct i.gst_rate) = 1 then max(i.gst_rate) end
    into t, one
    from public.orders o join public.order_items i on i.order_id = o.id
   where o.id = p_order;
  s := coalesce(public.shipping_gst(p_order), 0);
  update public.orders
     set tax = coalesce(t, 0) + s,
         total = subtotal + shipping + case when gst_inclusive then 0 else coalesce(t, 0) + s end,
         gst_rate = one
   where id = p_order;
end;
$$;
revoke all on function public.order_retax(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- 2. buyer GSTIN

alter table public.orders add column if not exists buyer_gstin text not null default '';
alter table public.orders drop constraint if exists orders_buyer_gstin_format;
alter table public.orders add constraint orders_buyer_gstin_format
  check (buyer_gstin = '' or buyer_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');

create or replace function public.admin_set_buyer_gstin(p_order uuid, p_gstin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g text := upper(btrim(coalesce(p_gstin, '')));
  inv text;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if g <> '' and g !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'That GSTIN doesn''t look right: it''s 15 characters, like 27ABCDE1234F1Z5.' using errcode = '22023';
  end if;
  select o.invoice_number into inv from public.orders o where o.id = p_order for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if inv is not null then
    raise exception 'Invoice % is already issued, so the buyer''s GSTIN can''t change.', inv using errcode = '22023';
  end if;
  update public.orders set buyer_gstin = g where id = p_order;
end;
$$;
revoke all on function public.admin_set_buyer_gstin(uuid, text) from public, anon;
grant execute on function public.admin_set_buyer_gstin(uuid, text) to authenticated;

-- ---------------------------------------------------------------- 3. credit notes

create table if not exists public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  order_id uuid not null references public.orders (id) on delete restrict,
  -- the refund it was issued for; null if that refund was undone later
  refund_id uuid unique references public.order_refunds (id) on delete set null,
  issued_at timestamptz not null default now(),
  -- as the refund stood when the note was issued
  amount numeric(10, 2) not null,
  tax numeric(10, 2) not null default 0,
  shipping numeric(10, 2) not null default 0
);
create index if not exists credit_notes_order_idx on public.credit_notes (order_id);
alter table public.credit_notes enable row level security;
drop policy if exists "admins read credit notes" on public.credit_notes;
create policy "admins read credit notes" on public.credit_notes for select to authenticated using (public.is_admin());
revoke all on public.credit_notes from anon, authenticated;
grant select on public.credit_notes to authenticated;

-- Notes for every refund on these orders that has none yet, oldest first.
-- Only invoiced orders get them (a credit note corrects an invoice).
create or replace function public.admin_issue_credit_notes(p_orders uuid[])
returns table (id uuid, number text, order_id uuid, refund_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r record;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  y int := extract(year from today)::int - case when extract(month from today) < 4 then 1 else 0 end;
  fy text := lpad((y % 100)::text, 2, '0') || '-' || lpad(((y + 1) % 100)::text, 2, '0');
  prefix text;
  n int;
  srate numeric;
  stax numeric;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  select st.invoice_prefix into prefix from public.store_settings st where st.id = 1;

  for r in
    select f.id as refund_id, f.order_id, f.amount, f.tax, f.shipping, o.shipping_taxed, o.gst_inclusive
      from public.order_refunds f
      join public.orders o on o.id = f.order_id
     where f.order_id = any(p_orders)
       and o.invoice_number is not null
       and not exists (select 1 from public.credit_notes c where c.refund_id = f.id)
     order by f.created_at
     for update of f
  loop
    -- the refunded shipping carries its GST too (refunds hold amounts with GST)
    stax := 0;
    if r.shipping_taxed and r.shipping > 0 then
      select coalesce(max(i.gst_rate), 0) into srate from public.order_items i where i.order_id = r.order_id;
      stax := public.line_gst(r.shipping, srate, true);
    end if;
    insert into public.invoice_counters as c (fy, last) values ('CN-' || fy, 1)
      on conflict (fy) do update set last = c.last + 1
      returning c.last into n;
    insert into public.credit_notes (number, order_id, refund_id, amount, tax, shipping)
    values (coalesce(prefix, 'BJ') || '-CN/' || fy || '/' || lpad(n::text, 4, '0'), r.order_id, r.refund_id, r.amount, r.tax + stax, r.shipping);
  end loop;

  return query
    select c.id, c.number, c.order_id, c.refund_id from public.credit_notes c where c.order_id = any(p_orders) order by c.issued_at;
end;
$$;
revoke all on function public.admin_issue_credit_notes(uuid[]) from public, anon;
grant execute on function public.admin_issue_credit_notes(uuid[]) to authenticated;

-- ---------------------------------------------------------------- 4. purchase bill ticks

alter table public.stock_receipts add column if not exists in_2b boolean not null default false;
alter table public.stock_receipts add column if not exists paid_on date;

create or replace function public.admin_set_receipt_flags(p_receipt uuid, p_in_2b boolean, p_paid_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  update public.stock_receipts
     set in_2b = coalesce(p_in_2b, false), paid_on = p_paid_on
   where id = p_receipt and kind = 'bill';
  if not found then
    raise exception 'Only supplier bills have these ticks.' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.admin_set_receipt_flags(uuid, boolean, date) from public, anon;
grant execute on function public.admin_set_receipt_flags(uuid, boolean, date) to authenticated;

-- Input tax credit per month from posted, claimable bills: what the bills
-- carry, and what can be claimed now (ticked as in GSTR-2B).
create or replace function public.admin_itc(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(m order by m->>'month'), '[]') into r from (
    select jsonb_build_object(
             'month', to_char(s.bill_date, 'YYYY-MM'),
             'on_bills', round(sum(l.gst), 2),
             'in_2b', round(sum(l.gst) filter (where s.in_2b), 2),
             'cgst', round(sum(l.cgst) filter (where s.in_2b), 2),
             'sgst', round(sum(l.sgst) filter (where s.in_2b), 2),
             'igst', round(sum(l.igst) filter (where s.in_2b), 2),
             'not_in_2b_bills', count(distinct s.id) filter (where not s.in_2b)) as m
      from public.stock_receipts s
      join public.stock_receipt_lines l on l.receipt_id = s.id
     where s.status = 'posted' and l.claimable
       and (p_from is null or s.bill_date >= p_from)
       and (p_to is null or s.bill_date <= p_to)
     group by to_char(s.bill_date, 'YYYY-MM')
  ) x(m);
  return r;
end;
$$;
revoke all on function public.admin_itc(date, date) from public, anon;
grant execute on function public.admin_itc(date, date) to authenticated;

-- Supplier bills claimed or claimable but unpaid 180 days after their date:
-- the credit on them has to be reversed until they are paid.
create or replace function public.admin_unpaid_bills(p_days int default 180)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'bill_no', s.bill_no, 'bill_date', s.bill_date, 'supplier', sp.name,
                                               'days', (current_date - s.bill_date), 'gst', t.gst) order by s.bill_date), '[]')
    into r
    from public.stock_receipts s
    left join public.suppliers sp on sp.id = s.supplier_id
    join lateral (select round(sum(l.gst) filter (where l.claimable), 2) as gst from public.stock_receipt_lines l where l.receipt_id = s.id) t on true
   where s.kind = 'bill' and s.status = 'posted' and s.paid_on is null
     and s.bill_date <= current_date - p_days;
  return r;
end;
$$;
revoke all on function public.admin_unpaid_bills(int) from public, anon;
grant execute on function public.admin_unpaid_bills(int) to authenticated;

-- the data download gains the credit notes
create or replace function public.export_table_list()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['addresses', 'audit_log', 'cart_items', 'carts', 'categories', 'collection_items', 'collections',
               'credit_notes', 'customer_notes', 'customer_segments', 'login_events', 'order_events', 'order_item_costs', 'order_items',
               'order_refund_items', 'order_refunds', 'order_requests', 'orders', 'payments', 'product_images',
               'product_reviews', 'product_variants', 'products', 'profiles', 'saved_products', 'shipments',
               'site_events', 'stock_daily', 'stock_movements', 'stock_receipt_lines', 'stock_receipts', 'suppliers', 'variant_costs'];
$$;
