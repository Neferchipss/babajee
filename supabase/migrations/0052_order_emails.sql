-- 0052 Order emails through Resend.
--
-- When an order event is recorded (paid, shipped, refund or return,
-- cancelled), the database calls the order-email Edge Function
-- (supabase/functions/order-email) with just the event's id; the function
-- reads the order itself with the service role, sends through Resend, and
-- logs it here. Calls go out with pg_net after the transaction commits, and
-- an email problem never stops an order from saving.
--
-- Off until email_config is filled in and enabled (see supabase/README.md).
-- Depends on 0051. Safe to re-run.

create extension if not exists pg_net with schema extensions;

-- one row: where the function lives, and the switch
create table if not exists public.email_config (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  function_url text not null default '',
  -- the project's public anon key: lets the call past the function's JWT check
  anon_key text not null default ''
);
insert into public.email_config (id) values (1) on conflict (id) do nothing;
alter table public.email_config enable row level security;
revoke all on public.email_config from anon, authenticated;

-- one row per event emailed: also what stops an event being emailed twice
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.order_events (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null,
  to_address text not null default '',
  resend_id text,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists email_log_order_idx on public.email_log (order_id);
alter table public.email_log enable row level security;
drop policy if exists "admins read email log" on public.email_log;
create policy "admins read email log" on public.email_log for select to authenticated using (public.is_admin());
revoke all on public.email_log from anon, authenticated;
grant select on public.email_log to authenticated;

create or replace function public.order_events_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  if new.status not in ('paid', 'shipped', 'refund', 'return', 'cancelled') then
    return null;
  end if;
  select * into c from public.email_config where id = 1;
  if not found or not c.enabled or c.function_url = '' then
    return null;
  end if;
  begin
    perform net.http_post(
      url := c.function_url,
      body := jsonb_build_object('event_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || c.anon_key),
      timeout_milliseconds := 10000);
  exception when others then
    -- never let email break an order
    raise warning 'order email not queued: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.order_events_email() from public, anon, authenticated;

drop trigger if exists order_events_email on public.order_events;
create trigger order_events_email after insert on public.order_events
  for each row execute function public.order_events_email();

-- the data download gains the email log
create or replace function public.export_table_list()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['addresses', 'audit_log', 'cart_items', 'carts', 'categories', 'collection_items', 'collections',
               'credit_notes', 'customer_notes', 'customer_segments', 'email_log', 'login_events', 'order_events', 'order_item_costs', 'order_items',
               'order_refund_items', 'order_refunds', 'order_requests', 'orders', 'payments', 'product_images',
               'product_reviews', 'product_variants', 'products', 'profiles', 'saved_products', 'shipments',
               'site_events', 'stock_daily', 'stock_movements', 'stock_receipt_lines', 'stock_receipts', 'suppliers', 'variant_costs'];
$$;
