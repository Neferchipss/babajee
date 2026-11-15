-- Manual payment (the client's choice: no payment gateway). An order is placed
-- unpaid ("pending"); an executive contacts the customer for payment and the
-- shop marks it paid. This migration:
-- 1. store_settings.unpaid_hours: how long an unpaid order holds its stock
--    (default 48; 0 = never expires).
-- 2. expire_unpaid_orders(): cancels real (non-test) pending orders older than
--    that, puts their stock back (same as a customer cancelling an unpaid
--    order, 0022) and notes "Not paid within N hours". pg_cron runs it every
--    15 minutes. The customer gets the usual cancelled email.
-- 3. order_events_email: also fires on "pending", so placing an order sends
--    the customer an "order received" email and the shop its new-order alert
--    (the function only sends for the "Order placed" event, not for an order
--    moved back to pending).

-- ---------------------------------------------------------------- 1. setting
alter table public.store_settings add column if not exists unpaid_hours int not null default 48;
alter table public.store_settings drop constraint if exists store_settings_unpaid_hours_check;
alter table public.store_settings add constraint store_settings_unpaid_hours_check check (unpaid_hours between 0 and 720);

-- ---------------------------------------------------------------- 2. expiry
create or replace function public.expire_unpaid_orders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  hrs int;
  o record;
  n int := 0;
begin
  select coalesce(unpaid_hours, 48) into hrs from public.store_settings where id = 1;
  if hrs is null or hrs <= 0 then
    return 0;
  end if;
  for o in
    select id from public.orders
     where status = 'pending' and not is_test and paid_total is null
       and created_at < now() - make_interval(hours => hrs)
     order by created_at
     for update skip locked
  loop
    perform set_config('babajee.stock_reason', 'cancel', true);
    perform set_config('babajee.order_id', o.id::text, true);
    update public.product_variants pv
       set stock_qty = pv.stock_qty + oi.qty
      from (select variant_id, sum(quantity)::int qty from public.order_items
             where order_id = o.id and variant_id is not null group by variant_id) oi
     where pv.id = oi.variant_id and pv.track_stock;
    perform set_config('babajee.event_note', format('Not paid within %s hours', hrs), true);
    update public.orders set status = 'cancelled' where id = o.id;
    n := n + 1;
  end loop;
  perform set_config('babajee.event_note', '', true);
  perform set_config('babajee.stock_reason', '', true);
  perform set_config('babajee.order_id', '', true);
  return n;
end;
$$;
revoke all on function public.expire_unpaid_orders() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.unschedule('babajee-expire-unpaid') where exists (select 1 from cron.job where jobname = 'babajee-expire-unpaid');
select cron.schedule('babajee-expire-unpaid', '*/15 * * * *', 'select public.expire_unpaid_orders()');

-- ---------------------------------------------------------------- 3. emails on placing
create or replace function public.order_events_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  if new.status not in ('pending', 'paid', 'shipped', 'delivered', 'refund', 'return', 'cancelled') then
    return null;
  end if;
  -- "pending" only when the order is first placed
  if new.status = 'pending' and new.note <> 'Order placed' then
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
