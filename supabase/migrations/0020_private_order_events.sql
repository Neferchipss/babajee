-- Staff comments, edit notes and refund notes on an order's timeline are for
-- the shop only. Until now a customer could read every event on their own
-- order (0004); the admin page promises "the customer never sees it", so the
-- database now keeps them to the status changes (placed, paid, packed,
-- shipped, delivered, cancelled, refunded), which is all their order page
-- shows. Admins still read everything.
--
-- Safe to re-run.

drop policy if exists "read own order events" on public.order_events;
create policy "read own order events" on public.order_events
  for select to authenticated
  using (
    public.is_admin()
    or (status in ('pending', 'paid', 'packed', 'shipped', 'delivered', 'cancelled', 'refunded')
        and exists (select 1 from public.orders o where o.id = order_id and o.profile_id = (select auth.uid())))
  );
