-- Failed deliveries. The courier could not deliver a shipped order (not home,
-- wrong address, unreachable, refused): the shop records it, then either
-- sends it again or, when the parcel comes back, takes it in with the
-- existing return-and-refund (admin_refund, 0017; delivery charge kept by
-- default on the page).
--
-- 1. orders.delivery_failed_at / delivery_failed_reason: set while a failed
--    delivery is open; the customer's order page reads them to say so.
--    orders.delivery_attempts counts failures over the order's life.
-- 2. admin_delivery_failed(order, reason, note): a shipped order only.
-- 3. admin_send_again(order, carrier, tracking, note): clears it and records
--    the new courier and tracking number on the shipment.
-- 4. Leaving "shipped" in any way (delivered, refunded, cancelled, back a
--    step) closes an open failed delivery.
-- 5. admin_came_back(order, note): the parcel is back at the shop. The page
--    first records the return and refund (admin_refund, items back in stock,
--    delivery charge kept by default); this then closes the order as
--    refunded, noting it came back undelivered. (A shipped order cannot be
--    cancelled, and cancelling would put the stock back a second time.)
-- 6. admin_failed_deliveries(from, to): failures recorded in a date range,
--    for Analytics.
-- Timeline rows use status 'delivery_failed' and 'sent_again', which the
-- customer never reads (0020 keeps them to the order steps).
-- Depends on 0004, 0013, 0017, 0020, 0021. Safe to re-run.

alter table public.orders add column if not exists delivery_failed_at timestamptz;
alter table public.orders add column if not exists delivery_failed_reason text not null default '';
alter table public.orders add column if not exists delivery_attempts int not null default 0;

create or replace function public.admin_delivery_failed(p_order uuid, p_reason text, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  why text := left(coalesce(nullif(trim(p_reason), ''), 'Not delivered'), 80);
begin
  if not public.is_admin() then
    raise exception 'Only an admin can do this.' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null then
    raise exception 'Order not found.';
  end if;
  if o.status <> 'shipped' then
    raise exception 'Only a shipped order can have a failed delivery.';
  end if;
  update public.orders
     set delivery_failed_at = now(), delivery_failed_reason = why, delivery_attempts = delivery_attempts + 1
   where id = p_order;
  insert into public.order_events (order_id, status, note, actor_id)
  values (p_order, 'delivery_failed', why || coalesce(nullif(' · ' || trim(coalesce(p_note, '')), ' · '), ''), auth.uid());
end;
$$;

create or replace function public.admin_send_again(p_order uuid, p_carrier text default null, p_tracking text default null, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  c text := nullif(trim(coalesce(p_carrier, '')), '');
  t text := nullif(trim(coalesce(p_tracking, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only an admin can do this.' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null then
    raise exception 'Order not found.';
  end if;
  if o.status <> 'shipped' or o.delivery_failed_at is null then
    raise exception 'This order has no failed delivery to send again.';
  end if;
  update public.orders set delivery_failed_at = null, delivery_failed_reason = '' where id = p_order;
  if c is not null or t is not null then
    if exists (select 1 from public.shipments where order_id = p_order) then
      update public.shipments
         set carrier = coalesce(c, carrier), tracking_number = coalesce(t, tracking_number), shipped_at = now()
       where order_id = p_order;
    else
      insert into public.shipments (order_id, carrier, tracking_number, shipped_at) values (p_order, c, t, now());
    end if;
  end if;
  insert into public.order_events (order_id, status, note, actor_id)
  values (
    p_order, 'sent_again',
    trim(both ' ·' from concat_ws(' · ', nullif(concat_ws(' ', c, t), ''), nullif(trim(coalesce(p_note, '')), ''))),
    auth.uid());
end;
$$;

create or replace function public.admin_came_back(p_order uuid, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can do this.' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null then
    raise exception 'Order not found.';
  end if;
  if o.status = 'refunded' then
    return; -- the refund already covered everything paid
  end if;
  if o.status <> 'shipped' then
    raise exception 'Only a shipped order can come back undelivered.';
  end if;
  perform set_config('babajee.event_note',
    'Came back undelivered' || coalesce(nullif(' · ' || trim(coalesce(p_note, '')), ' · '), ''), true);
  update public.orders set status = 'refunded' where id = p_order;
  perform set_config('babajee.event_note', '', true);
end;
$$;

-- leaving "shipped" closes an open failed delivery
create or replace function public.orders_close_failed_delivery()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status <> 'shipped' then
    new.delivery_failed_at := null;
    new.delivery_failed_reason := '';
  end if;
  return new;
end;
$$;
drop trigger if exists orders_close_failed_delivery on public.orders;
create trigger orders_close_failed_delivery
  before update of status on public.orders
  for each row execute function public.orders_close_failed_delivery();

create or replace function public.admin_failed_deliveries(p_from date, p_to date)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return (
    select count(*)::int from public.order_events
     where status = 'delivery_failed'
       and created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
       and created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata'));
end;
$$;

revoke all on function public.admin_delivery_failed(uuid, text, text) from public, anon;
revoke all on function public.admin_send_again(uuid, text, text, text) from public, anon;
revoke all on function public.admin_came_back(uuid, text) from public, anon;
revoke all on function public.admin_failed_deliveries(date, date) from public, anon;
grant execute on function public.admin_delivery_failed(uuid, text, text) to authenticated;
grant execute on function public.admin_send_again(uuid, text, text, text) to authenticated;
grant execute on function public.admin_came_back(uuid, text) to authenticated;
grant execute on function public.admin_failed_deliveries(date, date) to authenticated;
