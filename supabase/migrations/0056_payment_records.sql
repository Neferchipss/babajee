-- Manual payments, recorded (the client takes payment by hand, no gateway).
-- 1. payments (from 0004, built for a gateway and never used) gains the
--    method (UPI, bank transfer, cash...), the transaction reference, the day
--    the money came in, who recorded it and a note. provider is now 'manual'.
--    A payment whose order goes back to unpaid is marked 'void', not deleted.
--    (0005's bank-transfer rows and statuses stay valid.)
-- 2. store_settings.payment_methods: the methods offered in "Mark paid".
-- 3. Every order leaving "pending" gets its payment row, written by a trigger
--    on orders (so bulk "mark paid" and the road's steps record one too). The
--    method, reference and day come from admin_mark_paid() through
--    transaction-local settings; other paths record the amount with no method.
-- 4. admin_mark_paid(order, method, reference, day, note): the "Mark paid"
--    form. Admins only, pending orders only.
-- 5. Paid orders from before this get their row, method blank, dated by the
--    "paid" event.

-- ---------------------------------------------------------------- 1. payments
alter table public.payments alter column provider set default 'manual';
alter table public.payments add column if not exists method text not null default '';
alter table public.payments add column if not exists reference text not null default '';
alter table public.payments add column if not exists received_on date;
alter table public.payments add column if not exists recorded_by uuid references public.profiles (id) on delete set null;
alter table public.payments add column if not exists note text not null default '';
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('created', 'authorized', 'awaiting_confirmation', 'captured', 'failed', 'refunded', 'void'));
alter table public.payments drop constraint if exists payments_method_len;
alter table public.payments add constraint payments_method_len check (length(method) <= 40 and length(reference) <= 80 and length(note) <= 500);

-- ---------------------------------------------------------------- 2. methods
alter table public.store_settings add column if not exists payment_methods text[] not null default array['UPI', 'Bank transfer', 'Cash'];

-- ---------------------------------------------------------------- 3. the row, whatever path paid it
create or replace function public.orders_record_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m text := coalesce(current_setting('babajee.pay_method', true), '');
  ref text := coalesce(current_setting('babajee.pay_ref', true), '');
  d text := coalesce(current_setting('babajee.pay_day', true), '');
  n text := coalesce(current_setting('babajee.pay_note', true), '');
begin
  if old.status = 'pending' and new.status in ('paid', 'packed', 'shipped', 'delivered') and new.paid_total is not null then
    insert into public.payments (order_id, provider, method, reference, amount, status, received_on, recorded_by, note)
    values (new.id, 'manual', m, ref, new.paid_total, 'captured',
            coalesce(nullif(d, '')::date, (now() at time zone 'Asia/Kolkata')::date), (select auth.uid()), n);
  elsif old.paid_total is not null and new.paid_total is null then
    -- moved back to unpaid: the payment no longer stands
    update public.payments set status = 'void' where order_id = new.id and status = 'captured';
  end if;
  return null;
end;
$$;
revoke all on function public.orders_record_payment() from public, anon, authenticated;

drop trigger if exists orders_record_payment on public.orders;
create trigger orders_record_payment
  after update of status, paid_total on public.orders
  for each row execute function public.orders_record_payment();

-- ---------------------------------------------------------------- 4. the "Mark paid" form
create or replace function public.admin_mark_paid(p_order uuid, p_method text, p_reference text default '', p_received date default null, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  m text := left(trim(coalesce(p_method, '')), 40);
  ref text := left(trim(coalesce(p_reference, '')), 80);
  n text := left(trim(coalesce(p_note, '')), 500);
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.is_admin() then
    raise exception 'Only the shop can do that.';
  end if;
  select id, status into o from public.orders where id = p_order for update;
  if o.id is null then
    raise exception 'Order not found.';
  end if;
  if o.status <> 'pending' then
    raise exception 'This order isn''t waiting for payment.';
  end if;
  if m = '' then
    raise exception 'Choose how it was paid.';
  end if;
  if p_received is not null and (p_received > today or p_received < today - 365) then
    raise exception 'The payment date must be within the last year, and not in the future.';
  end if;

  perform set_config('babajee.pay_method', m, true);
  perform set_config('babajee.pay_ref', ref, true);
  perform set_config('babajee.pay_day', coalesce(p_received, today)::text, true);
  perform set_config('babajee.pay_note', n, true);
  perform public.admin_update_order(p_order, 'paid', concat_ws(' · ', 'Paid by ' || m, nullif('ref ' || nullif(ref, ''), ''), nullif(n, '')), null, null, false);
  perform set_config('babajee.pay_method', '', true);
  perform set_config('babajee.pay_ref', '', true);
  perform set_config('babajee.pay_day', '', true);
  perform set_config('babajee.pay_note', '', true);
end;
$$;
revoke all on function public.admin_mark_paid(uuid, text, text, date, text) from public, anon;
grant execute on function public.admin_mark_paid(uuid, text, text, date, text) to authenticated;

-- ---------------------------------------------------------------- 5. orders paid before this
insert into public.payments (order_id, provider, method, amount, status, received_on)
select o.id, 'manual', '', o.paid_total, 'captured',
       coalesce((select (min(e.created_at) at time zone 'Asia/Kolkata')::date from public.order_events e where e.order_id = o.id and e.status = 'paid'),
                (o.created_at at time zone 'Asia/Kolkata')::date)
  from public.orders o
 where o.paid_total is not null
   and not exists (select 1 from public.payments p where p.order_id = o.id and p.status = 'captured');
