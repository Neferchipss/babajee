-- 0053 Test orders get their own document series, so the real invoices and
-- credit notes run BJ/26-27/0001, CN/26-27/0001 with no gaps from practice
-- orders: test orders take TEST/26-27/0001 and TCN/26-27/0001 (own counters).
-- Test suppliers and their bills are marked too, so they can be told apart
-- and cleared before the real opening count.
--
-- Depends on 0051. Safe to re-run.

alter table public.suppliers add column if not exists is_test boolean not null default false;
alter table public.stock_receipts add column if not exists is_test boolean not null default false;

create or replace function public.issue_invoice(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  prefix text;
  fy text := public.current_fy();
  test boolean;
  f record;
begin
  select x.is_test into test from public.orders x
   where x.id = p_order and x.invoice_number is null and x.status <> 'cancelled' and x.paid_total is not null
   for update;
  if not found then
    return;
  end if;
  select st.invoice_prefix into prefix from public.store_settings st where st.id = 1;
  update public.orders x
     set invoice_number = case when test then 'TEST/' || fy || '/' || public.next_doc_number('TEST-' || fy)
                               else coalesce(nullif(prefix, ''), 'BJ') || '/' || fy || '/' || public.next_doc_number(fy) end,
         invoice_date = now()
   where x.id = p_order;
  for f in select r.id from public.order_refunds r where r.order_id = p_order order by r.created_at loop
    perform public.issue_credit_note(f.id);
  end loop;
end;
$$;
revoke all on function public.issue_invoice(uuid) from public, anon, authenticated;

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
  select f.id, f.order_id, f.amount, f.shipping, o.is_test into r
    from public.order_refunds f join public.orders o on o.id = f.order_id
   where f.id = p_refund and o.invoice_number is not null
     and not exists (select 1 from public.credit_notes c where c.refund_id = f.id);
  if not found then
    return;
  end if;
  insert into public.credit_notes (number, order_id, refund_id, amount, tax, shipping)
  values (case when r.is_test then 'TCN/' || fy || '/' || public.next_doc_number('TCN-' || fy)
               else 'CN/' || fy || '/' || public.next_doc_number('CN-' || fy) end,
          r.order_id, r.id, r.amount, public.refund_tax(r.id), r.shipping);
end;
$$;
revoke all on function public.issue_credit_note(uuid) from public, anon, authenticated;
