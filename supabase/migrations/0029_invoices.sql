-- GST invoices and packing slips.
-- 1. The shop's own details, printed on every invoice: trading and legal
--    name, address, GSTIN, phone, email, an invoice prefix and a closing
--    line. Readable by anyone (they're on every invoice), set by admins.
-- 2. Invoice numbers: one running series per financial year (April to
--    March, India time), e.g. BJ/26-27/0001. An order gets its number the
--    first time its invoice is made, and keeps it.
-- Safe to re-run.

-- ---------------------------------------------------------------- 1. store details

alter table public.store_settings add column if not exists store_name text not null default 'Babajee';
alter table public.store_settings add column if not exists legal_name text not null default '';
alter table public.store_settings add column if not exists gstin text not null default '';
alter table public.store_settings add column if not exists store_address text not null default '';
alter table public.store_settings add column if not exists store_phone text not null default '';
alter table public.store_settings add column if not exists store_email text not null default '';
alter table public.store_settings add column if not exists invoice_prefix text not null default 'BJ';
alter table public.store_settings add column if not exists invoice_note text not null default 'Thank you for shopping with Babajee.';

alter table public.store_settings drop constraint if exists store_settings_gstin_format;
alter table public.store_settings add constraint store_settings_gstin_format
  check (gstin = '' or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');
alter table public.store_settings drop constraint if exists store_settings_invoice_prefix_format;
alter table public.store_settings add constraint store_settings_invoice_prefix_format
  check (invoice_prefix ~ '^[A-Z0-9]{1,5}$');

-- ---------------------------------------------------------------- 2. invoice numbers

alter table public.orders add column if not exists invoice_number text unique;
alter table public.orders add column if not exists invoice_date timestamptz;

create table if not exists public.invoice_counters (
  fy text primary key,          -- '26-27'
  last int not null default 0
);
alter table public.invoice_counters enable row level security;
revoke all on public.invoice_counters from anon, authenticated;

-- Numbers for these orders, oldest first, for any that don't have one yet.
-- Only orders that have been paid get one (a GST invoice is for a supply
-- that happened); cancelled and unpaid orders are skipped.
create or replace function public.admin_issue_invoices(p_orders uuid[])
returns table (order_id uuid, invoice_number text, invoice_date timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  o record;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  y int := extract(year from today)::int - case when extract(month from today) < 4 then 1 else 0 end;
  fy text := lpad((y % 100)::text, 2, '0') || '-' || lpad(((y + 1) % 100)::text, 2, '0');
  prefix text;
  n int;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  select st.invoice_prefix into prefix from public.store_settings st where st.id = 1;

  for o in
    select x.id from public.orders x
     where x.id = any(p_orders) and x.invoice_number is null
       and x.status <> 'cancelled' and x.paid_total is not null
     order by x.created_at
     for update
  loop
    insert into public.invoice_counters as c (fy, last) values (fy, 1)
      on conflict (fy) do update set last = c.last + 1
      returning c.last into n;
    update public.orders x
       set invoice_number = coalesce(prefix, 'BJ') || '/' || fy || '/' || lpad(n::text, 4, '0'),
           invoice_date = now()
     where x.id = o.id;
  end loop;

  return query
    select x.id, x.invoice_number, x.invoice_date from public.orders x where x.id = any(p_orders);
end;
$$;

revoke all on function public.admin_issue_invoices(uuid[]) from public, anon;
grant execute on function public.admin_issue_invoices(uuid[]) to authenticated;
