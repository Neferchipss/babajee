-- 0051 GST compliance for a regular GST-registered shop.
--
-- 1. Invoices are issued automatically when an order is paid (dated then),
--    so every supply has its invoice in the right return period. The series
--    no longer truncates past 9999.
-- 2. The buyer's GSTIN on an order (B2B), set by the shop before the
--    invoice is issued, printed on the invoice and reported in GSTR-1.
-- 3. Credit notes: issued automatically for each refund on an invoiced
--    order (and for earlier refunds when the invoice is issued), own series
--    per financial year (CN/26-27/0001, well inside GST's 16-character
--    limit), keeping the refund's amount and GST. A refund's GST is now
--    worked out line by line at each item's own rate. A
--    refund with a credit note can no longer be undone.
-- 4. Invoiced orders are locked: their lines, prices, address and contact
--    can't change (refund instead, which issues a credit note).
-- 5. Each order line keeps the HSN code it was sold under.
-- 6. Purchase bills: "in GSTR-2B" (with the 2B month) and "paid on". ITC
--    counts only claimable lines on bills in GSTR-2B, by 2B month; bills
--    unpaid 180 days after their date are listed for reversal.
--
-- GST on shipping is NOT here: it waits for the CA (composite or mixed
-- supply, rate, SAC code).
--
-- Depends on 0050. Safe to re-run.

-- ---------------------------------------------------------------- shared

-- '26-27' for today's financial year (India, April to March)
create or replace function public.current_fy()
returns text
language sql
stable
set search_path = ''
as $$
  select lpad((y % 100)::text, 2, '0') || '-' || lpad(((y + 1) % 100)::text, 2, '0')
    from (select extract(year from d)::int - case when extract(month from d) < 4 then 1 else 0 end as y
            from (select (now() at time zone 'Asia/Kolkata')::date as d) a) b;
$$;

-- next number in a series: 4 digits, more once past 9999 (never truncated)
create or replace function public.next_doc_number(p_key text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  n int;
begin
  insert into public.invoice_counters as c (fy, last) values (p_key, 1)
    on conflict (fy) do update set last = c.last + 1
    returning c.last into n;
  return case when n < 10000 then lpad(n::text, 4, '0') else n::text end;
end;
$$;
revoke all on function public.next_doc_number(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 5. HSN per order line

alter table public.order_items add column if not exists hsn text not null default '';
drop trigger if exists order_items_lock_invoiced on public.order_items;
update public.order_items i set hsn = p.hsn
  from public.product_variants v join public.products p on p.id = v.product_id
 where v.id = i.variant_id and i.hsn = '' and coalesce(p.hsn, '') <> '';

create or replace function public.order_items_set_hsn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.hsn, '') = '' and new.variant_id is not null then
    select coalesce(p.hsn, '') into new.hsn
      from public.product_variants v join public.products p on p.id = v.product_id
     where v.id = new.variant_id;
  end if;
  new.hsn := coalesce(new.hsn, '');
  return new;
end;
$$;
drop trigger if exists order_items_set_hsn on public.order_items;
create trigger order_items_set_hsn before insert on public.order_items
  for each row execute function public.order_items_set_hsn();

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

-- An order taken by the shop for a business buyer: created as usual, with
-- the buyer's GSTIN set in the same transaction, before its invoice is
-- issued (at commit) when it's created as paid.
create or replace function public.admin_create_order_b2b(
  p_customer uuid, p_contact jsonb, p_address jsonb, p_lines jsonb,
  p_shipping numeric, p_notes text, p_paid boolean, p_gstin text)
returns table (order_id uuid, order_number text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r record;
begin
  select * into r from public.admin_create_order(p_customer, p_contact, p_address, p_lines, p_shipping, p_notes, p_paid);
  perform public.admin_set_buyer_gstin(r.order_id, p_gstin);
  return query select r.order_id, r.order_number;
end;
$$;
revoke all on function public.admin_create_order_b2b(uuid, jsonb, jsonb, jsonb, numeric, text, boolean, text) from public, anon;
grant execute on function public.admin_create_order_b2b(uuid, jsonb, jsonb, jsonb, numeric, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------- 3. credit notes

create table if not exists public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  order_id uuid not null references public.orders (id) on delete restrict,
  refund_id uuid not null unique references public.order_refunds (id) on delete restrict,
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

-- A refund's GST, line by line: each refunded item at its own rate (scaled
-- down when less than its value was refunded), and anything refunded beyond
-- the items (a discount or goodwill credit) split across the order's rates
-- in proportion to its goods. Shipping carries no GST. src/lib/credit-note.ts
-- lays out the same lines.
create or replace function public.refund_tax(p_refund uuid)
returns numeric
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
  t numeric;
  extra numeric;
  tot numeric;
  acc numeric := 0;
  part numeric;
  nr int;
  idx int := 0;
  g record;
begin
  select * into f from public.order_refunds where id = p_refund;
  if not found then
    return 0;
  end if;
  select * into o from public.orders where id = f.order_id;
  rest := f.amount - f.shipping;
  -- refunded items' value with GST
  select coalesce(sum(case when o.gst_inclusive then ri.quantity * i.unit_price
                           else ri.quantity * i.unit_price + public.line_gst(ri.quantity * i.unit_price, coalesce(i.gst_rate, o.gst_rate, 0), false) end), 0)
    into w
    from public.order_refund_items ri join public.order_items i on i.id = ri.order_item_id
   where ri.refund_id = f.id;
  if w > 0 and rest < w then
    k := rest / w;
    select coalesce(sum(public.line_gst(round(ri.quantity * i.unit_price * k, 2), coalesce(i.gst_rate, o.gst_rate, 0), o.gst_inclusive)), 0)
      into t
      from public.order_refund_items ri join public.order_items i on i.id = ri.order_item_id
     where ri.refund_id = f.id;
    return t;
  end if;
  select coalesce(sum(public.line_gst(ri.quantity * i.unit_price, coalesce(i.gst_rate, o.gst_rate, 0), o.gst_inclusive)), 0)
    into t
    from public.order_refund_items ri join public.order_items i on i.id = ri.order_item_id
   where ri.refund_id = f.id;
  extra := rest - w;
  if extra > 0 then
    select sum(x.gw), count(*) into tot, nr from (
      select sum(case when o.gst_inclusive then i.quantity * i.unit_price
                      else i.quantity * i.unit_price + public.line_gst(i.quantity * i.unit_price, coalesce(i.gst_rate, o.gst_rate, 0), false) end) as gw
        from public.order_items i where i.order_id = o.id group by coalesce(i.gst_rate, o.gst_rate, 0)) x;
    if coalesce(tot, 0) <= 0 then
      return t;
    end if;
    for g in
      select coalesce(i.gst_rate, o.gst_rate, 0) as rate,
             sum(case when o.gst_inclusive then i.quantity * i.unit_price
                      else i.quantity * i.unit_price + public.line_gst(i.quantity * i.unit_price, coalesce(i.gst_rate, o.gst_rate, 0), false) end) as gw
        from public.order_items i where i.order_id = o.id
       group by 1 order by 1
    loop
      idx := idx + 1;
      part := case when idx = nr then extra - acc else round(extra * g.gw / tot, 2) end;
      acc := acc + part;
      -- the credit includes its GST, whatever the order's pricing
      t := t + public.line_gst(part, g.rate, true);
    end loop;
  end if;
  return t;
end;
$$;
revoke all on function public.refund_tax(uuid) from public, anon, authenticated;

-- the note for one refund, if its order is invoiced and it has none yet
create or replace function public.issue_credit_note(p_refund uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  fy text := public.current_fy();
begin
  select f.id, f.order_id, f.amount, f.shipping into r
    from public.order_refunds f join public.orders o on o.id = f.order_id
   where f.id = p_refund and o.invoice_number is not null
     and not exists (select 1 from public.credit_notes c where c.refund_id = f.id);
  if not found then
    return;
  end if;
  insert into public.credit_notes (number, order_id, refund_id, amount, tax, shipping)
  values ('CN/' || fy || '/' || public.next_doc_number('CN-' || fy), r.order_id, r.id, r.amount, public.refund_tax(r.id), r.shipping);
end;
$$;
revoke all on function public.issue_credit_note(uuid) from public, anon, authenticated;

-- At the end of the refund's transaction (its items are in by then): set
-- its GST line by line (admin_refund splits it in the order's average
-- proportion), then issue its credit note if the order is invoiced.
create or replace function public.order_refunds_settle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t numeric;
  incl boolean;
begin
  perform 1 from public.order_refunds where id = new.id;
  if not found then
    return null;
  end if;
  t := public.refund_tax(new.id);
  select o.gst_inclusive into incl from public.orders o where o.id = new.order_id;
  update public.order_refunds
     set tax = t, subtotal = case when incl then amount - shipping else amount - shipping - t end
   where id = new.id and tax is distinct from t;
  perform public.issue_credit_note(new.id);
  return null;
end;
$$;
drop trigger if exists order_refunds_credit_note on public.order_refunds;
drop function if exists public.order_refunds_credit_note();
drop trigger if exists order_refunds_settle on public.order_refunds;
create constraint trigger order_refunds_settle after insert on public.order_refunds
  deferrable initially deferred
  for each row execute function public.order_refunds_settle();

-- a refund with a credit note stays: undoing it would leave tax credited
-- for money never returned
create or replace function public.order_refunds_keep_noted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n text;
begin
  select c.number into n from public.credit_notes c where c.refund_id = old.id;
  if found then
    raise exception 'Credit note % was issued for this refund, so it can''t be undone.', n using errcode = '22023';
  end if;
  return old;
end;
$$;
drop trigger if exists order_refunds_keep_noted on public.order_refunds;
create trigger order_refunds_keep_noted before delete on public.order_refunds
  for each row execute function public.order_refunds_keep_noted();

-- kept for the print page: notes for any refunds still without one, then all
create or replace function public.admin_issue_credit_notes(p_orders uuid[])
returns table (id uuid, number text, order_id uuid, refund_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  f record;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  for f in select x.id from public.order_refunds x where x.order_id = any(p_orders) order by x.created_at loop
    perform public.issue_credit_note(f.id);
  end loop;
  return query
    select c.id, c.number, c.order_id, c.refund_id from public.credit_notes c where c.order_id = any(p_orders) order by c.issued_at;
end;
$$;
revoke all on function public.admin_issue_credit_notes(uuid[]) from public, anon;
grant execute on function public.admin_issue_credit_notes(uuid[]) to authenticated;

-- ---------------------------------------------------------------- 1. invoices on payment

create or replace function public.issue_invoice(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  prefix text;
  fy text := public.current_fy();
  f record;
begin
  perform 1 from public.orders x
   where x.id = p_order and x.invoice_number is null and x.status <> 'cancelled' and x.paid_total is not null
   for update;
  if not found then
    return;
  end if;
  select st.invoice_prefix into prefix from public.store_settings st where st.id = 1;
  update public.orders x
     set invoice_number = coalesce(nullif(prefix, ''), 'BJ') || '/' || fy || '/' || public.next_doc_number(fy),
         invoice_date = now()
   where x.id = p_order;
  -- refunds made before the invoice existed get their notes now
  for f in select r.id from public.order_refunds r where r.order_id = p_order order by r.created_at loop
    perform public.issue_credit_note(f.id);
  end loop;
end;
$$;
revoke all on function public.issue_invoice(uuid) from public, anon, authenticated;

create or replace function public.orders_issue_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.paid_total is not null and new.invoice_number is null and new.status <> 'cancelled' then
    perform public.issue_invoice(new.id);
  end if;
  return new;
end;
$$;
-- deferred to the end of the transaction, so an order placed or created as
-- paid gets its invoice after its items and totals are in (and the lock
-- below doesn't stop them going in)
drop trigger if exists orders_issue_invoice on public.orders;
create constraint trigger orders_issue_invoice after insert or update of paid_total, status on public.orders
  deferrable initially deferred
  for each row execute function public.orders_issue_invoice();

-- 0029's admin_issue_invoices, now on the shared numbering (no truncation)
create or replace function public.admin_issue_invoices(p_orders uuid[])
returns table (order_id uuid, invoice_number text, invoice_date timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  o record;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  for o in select x.id from public.orders x where x.id = any(p_orders) order by x.created_at loop
    perform public.issue_invoice(o.id);
  end loop;
  return query
    select x.id, x.invoice_number, x.invoice_date from public.orders x where x.id = any(p_orders);
end;
$$;
revoke all on function public.admin_issue_invoices(uuid[]) from public, anon;
grant execute on function public.admin_issue_invoices(uuid[]) to authenticated;

-- refunds already made on invoiced orders get their notes now
do $$
declare
  f record;
begin
  for f in
    select r.id from public.order_refunds r join public.orders o on o.id = r.order_id
     where o.invoice_number is not null and not exists (select 1 from public.credit_notes c where c.refund_id = r.id)
     order by r.created_at
  loop
    perform public.issue_credit_note(f.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------- 4. invoiced orders are locked

create or replace function public.orders_lock_invoiced()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.invoice_number is not null and (
       new.subtotal is distinct from old.subtotal or new.shipping is distinct from old.shipping
    or new.tax is distinct from old.tax or new.total is distinct from old.total
    or new.gst_inclusive is distinct from old.gst_inclusive or new.buyer_gstin is distinct from old.buyer_gstin
    or new.contact_name is distinct from old.contact_name
    or new.address_line1 is distinct from old.address_line1 or new.address_line2 is distinct from old.address_line2
    or new.address_city is distinct from old.address_city or new.address_state is distinct from old.address_state
    or new.address_pincode is distinct from old.address_pincode) then
    raise exception 'Invoice % is issued, so this order can''t be edited. Refund instead: it issues a credit note.', old.invoice_number using errcode = '22023';
  end if;
  if old.invoice_number is not null and (
       (new.status in ('cancelled', 'pending') and new.status is distinct from old.status)
    or (new.paid_total is null and old.paid_total is not null)) then
    raise exception 'Invoice % is issued, so this order can''t be cancelled or made unpaid. Refund it instead: that issues a credit note.', old.invoice_number using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists orders_lock_invoiced on public.orders;
create trigger orders_lock_invoiced before update on public.orders
  for each row execute function public.orders_lock_invoiced();

create or replace function public.order_items_lock_invoiced()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  inv text;
begin
  -- a product option deleted later only clears the link
  if tg_op = 'UPDATE' and new.variant_id is null and old.variant_id is not null
     and (to_jsonb(new) - 'variant_id') = (to_jsonb(old) - 'variant_id') then
    return new;
  end if;
  select o.invoice_number into inv from public.orders o where o.id = coalesce(new.order_id, old.order_id);
  if inv is not null then
    raise exception 'Invoice % is issued, so this order''s items can''t change. Refund instead: it issues a credit note.', inv using errcode = '22023';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists order_items_lock_invoiced on public.order_items;
create trigger order_items_lock_invoiced before insert or update or delete on public.order_items
  for each row execute function public.order_items_lock_invoiced();

-- ---------------------------------------------------------------- 6. purchase bill ticks

alter table public.stock_receipts add column if not exists in_2b boolean not null default false;
-- the month (first day) whose GSTR-2B shows the bill: the ITC belongs there
alter table public.stock_receipts add column if not exists in_2b_month date;
alter table public.stock_receipts add column if not exists paid_on date;

drop function if exists public.admin_set_receipt_flags(uuid, boolean, date);
create or replace function public.admin_set_receipt_flags(p_receipt uuid, p_in_2b boolean, p_2b_month date, p_paid_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  bd date;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  select s.bill_date into bd from public.stock_receipts s where s.id = p_receipt and s.kind = 'bill';
  if not found then
    raise exception 'Only supplier bills have these ticks.' using errcode = '22023';
  end if;
  if p_paid_on is not null and p_paid_on < bd then
    raise exception 'The payment date can''t be before the bill date.' using errcode = '22023';
  end if;
  update public.stock_receipts
     set in_2b = coalesce(p_in_2b, false),
         in_2b_month = case when coalesce(p_in_2b, false) then date_trunc('month', coalesce(p_2b_month, bd))::date end,
         paid_on = p_paid_on
   where id = p_receipt;
end;
$$;
revoke all on function public.admin_set_receipt_flags(uuid, boolean, date, date) from public, anon;
grant execute on function public.admin_set_receipt_flags(uuid, boolean, date, date) to authenticated;

-- ITC per month: GST on claimable lines of posted bills by bill month, and the
-- part claimable now by its GSTR-2B month
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
  with lines as (
    select s.id, s.bill_date, s.in_2b, s.in_2b_month, l.gst, l.cgst, l.sgst, l.igst
      from public.stock_receipts s join public.stock_receipt_lines l on l.receipt_id = s.id
     where s.status = 'posted' and s.kind = 'bill' and l.claimable
  ),
  months as (
    select to_char(bill_date, 'YYYY-MM') as month, round(sum(gst), 2) as on_bills, count(distinct id) filter (where not in_2b) as not_in_2b_bills,
           0::numeric as in_2b, 0::numeric as cgst, 0::numeric as sgst, 0::numeric as igst
      from lines where (p_from is null or bill_date >= p_from) and (p_to is null or bill_date <= p_to)
     group by 1
    union all
    select to_char(in_2b_month, 'YYYY-MM'), 0, 0, round(sum(gst), 2), round(sum(cgst), 2), round(sum(sgst), 2), round(sum(igst), 2)
      from lines where in_2b and (p_from is null or in_2b_month >= date_trunc('month', p_from)) and (p_to is null or in_2b_month <= p_to)
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('month', month, 'on_bills', on_bills, 'in_2b', in_2b, 'cgst', cgst, 'sgst', sgst, 'igst', igst, 'not_in_2b_bills', not_in_2b_bills) order by month), '[]')
    into r
    from (select month, sum(on_bills) as on_bills, sum(in_2b) as in_2b, sum(cgst) as cgst, sum(sgst) as sgst, sum(igst) as igst, sum(not_in_2b_bills)::int as not_in_2b_bills
            from months group by month) m;
  return r;
end;
$$;
revoke all on function public.admin_itc(date, date) from public, anon;
grant execute on function public.admin_itc(date, date) to authenticated;

-- supplier bills with claimable GST still unpaid 180 days after their date
create or replace function public.admin_unpaid_bills(p_days int default 180)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'bill_no', s.bill_no, 'bill_date', s.bill_date, 'supplier', sp.name,
                                               'days', (today - s.bill_date), 'gst', t.gst, 'in_2b', s.in_2b) order by s.bill_date), '[]')
    into r
    from public.stock_receipts s
    left join public.suppliers sp on sp.id = s.supplier_id
    join lateral (select round(sum(l.gst) filter (where l.claimable), 2) as gst from public.stock_receipt_lines l where l.receipt_id = s.id) t on true
   where s.kind = 'bill' and s.status = 'posted' and s.paid_on is null
     and s.bill_date <= today - p_days and coalesce(t.gst, 0) > 0;
  return r;
end;
$$;
revoke all on function public.admin_unpaid_bills(int) from public, anon;
grant execute on function public.admin_unpaid_bills(int) to authenticated;

-- ---------------------------------------------------------------- data download

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
