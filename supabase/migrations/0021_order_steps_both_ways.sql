-- Set an order to any step of the road, forward or back, so a step clicked
-- by mistake can be taken back.
--
-- Forward goes through admin_update_order as before (shipping records the
-- courier). Back undoes what the later steps recorded:
--   back before "shipped"   the shipment (courier, tracking) is removed
--   delivered -> shipped    the delivery date is cleared
--   back to "pending"       the payment record (paid_total) is cleared;
--                           refused once the order has a refund
-- Each move lands on the timeline as the status it moved to, with a note.
-- Cancelled and refunded orders stay closed (undo a refund to reopen one).
--
-- Depends on 0013, 0017. Safe to re-run.

create or replace function public.admin_set_step(
  p_order uuid,
  p_status text,
  p_note text default '',
  p_carrier text default null,
  p_tracking text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  steps text[] := array['pending', 'paid', 'packed', 'shipped', 'delivered'];
  label text[] := array['Placed', 'Paid', 'Packed', 'Shipped', 'Delivered'];
  cur text;
  from_i int;
  to_i int;
  undone text[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change an order.' using errcode = '42501';
  end if;
  select status into cur from public.orders where id = p_order for update;
  if cur is null then
    raise exception 'Order not found.';
  end if;
  from_i := array_position(steps, cur);
  to_i := array_position(steps, p_status);
  if from_i is null then
    raise exception 'This order is %, so its steps can no longer change.', cur;
  end if;
  if to_i is null then
    raise exception 'Unknown step %.', p_status;
  end if;
  if to_i = from_i then
    return;
  end if;

  if to_i > from_i then
    -- straight to delivered, past shipped: keep the courier if one was given
    if p_status = 'delivered' and from_i < 4
       and (nullif(trim(coalesce(p_carrier, '')), '') is not null or nullif(trim(coalesce(p_tracking, '')), '') is not null)
       and not exists (select 1 from public.shipments where order_id = p_order) then
      insert into public.shipments (order_id, carrier, tracking_number, shipped_at)
      values (p_order, nullif(trim(p_carrier), ''), nullif(trim(p_tracking), ''), now());
    end if;
    perform public.admin_update_order(p_order, p_status, p_note, p_carrier, p_tracking, false);
    return;
  end if;

  -- going back
  if p_status = 'pending' then
    if exists (select 1 from public.order_refunds where order_id = p_order) then
      raise exception 'This order has a refund on it, so it can''t go back to unpaid.';
    end if;
    update public.orders set paid_total = null where id = p_order;
    undone := undone || 'payment cleared'::text;
  end if;
  if from_i >= 4 and to_i < 4 then
    if exists (select 1 from public.shipments where order_id = p_order) then
      delete from public.shipments where order_id = p_order;
      undone := undone || 'courier details removed'::text;
    end if;
  elsif from_i = 5 and to_i = 4 then
    update public.shipments set delivered_at = null where order_id = p_order;
  end if;

  perform set_config('babajee.event_note',
    concat_ws(' · ', 'Moved back from ' || label[from_i], nullif(array_to_string(undone, ', '), ''), nullif(trim(coalesce(p_note, '')), '')),
    true);
  update public.orders set status = p_status where id = p_order;
  perform set_config('babajee.event_note', '', true);
end;
$$;

revoke all on function public.admin_set_step(uuid, text, text, text, text) from public, anon;
grant execute on function public.admin_set_step(uuid, text, text, text, text) to authenticated;
