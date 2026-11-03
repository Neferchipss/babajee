-- Undo a refund recorded by mistake (wrong item, wrong amount).
--
-- The refund row goes (reports count refunds from order_refunds, so they
-- correct themselves); items it put back in stock come off the shelf again;
-- an order it had tipped into "refunded" returns to the status it had
-- before. The timeline keeps a line saying what was undone, so nothing
-- disappears without a trace.
--
-- Depends on 0017. Safe to re-run.

alter table public.stock_movements drop constraint if exists stock_movements_reason_check;
alter table public.stock_movements add constraint stock_movements_reason_check
  check (reason in ('sale', 'cancel', 'refund', 'return', 'edit', 'undo', 'manual'));

create or replace function public.admin_undo_refund(p_refund uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  o record;
  it record;
  back text;
  what text[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'Only an admin can undo a refund.' using errcode = '42501';
  end if;
  select * into r from public.order_refunds where id = p_refund;
  if r.id is null then
    raise exception 'That refund was already undone.';
  end if;
  select * into o from public.orders where id = r.order_id for update;

  perform set_config('babajee.stock_reason', 'undo', true);
  perform set_config('babajee.order_id', o.id::text, true);
  for it in
    select ri.quantity, i.product_name, i.variant_id, pv.track_stock, pv.stock_qty, pv.id as pv_id
      from public.order_refund_items ri
      join public.order_items i on i.id = ri.order_item_id
      left join public.product_variants pv on pv.id = i.variant_id
     where ri.refund_id = r.id
  loop
    what := what || (it.product_name || case when it.quantity > 1 then ' ×' || it.quantity else '' end);
    if r.restocked and it.track_stock then
      if it.stock_qty < it.quantity then
        raise exception '% was restocked by this refund but only % are on the shelf now, so it cannot come off again. Fix the stock count first.',
          it.product_name, it.stock_qty;
      end if;
      update public.product_variants set stock_qty = stock_qty - it.quantity where id = it.pv_id;
    end if;
  end loop;
  perform set_config('babajee.stock_reason', '', true);
  perform set_config('babajee.order_id', '', true);

  delete from public.order_refunds where id = r.id;

  insert into public.order_events (order_id, status, note, actor_id)
  values (o.id, 'refund_undone',
          concat_ws(' · ', public.rupees(r.amount), nullif(array_to_string(what, ', '), ''),
                    case when r.restocked and cardinality(what) > 0 then 'taken back out of stock' end),
          (select auth.uid()));

  -- a refund that closed the order: reopen it where it was
  if o.status = 'refunded' then
    select e.status into back
      from public.order_events e
     where e.order_id = o.id and e.status in ('paid', 'packed', 'shipped', 'delivered')
     -- statuses only move forward, so the furthest one reached is where it was
     order by array_position(array['paid', 'packed', 'shipped', 'delivered'], e.status) desc limit 1;
    perform set_config('babajee.event_note', 'Refund undone', true);
    update public.orders set status = coalesce(back, 'paid') where id = o.id;
    perform set_config('babajee.event_note', '', true);
  end if;
end;
$$;

revoke all on function public.admin_undo_refund(uuid) from public, anon;
grant execute on function public.admin_undo_refund(uuid) to authenticated;
