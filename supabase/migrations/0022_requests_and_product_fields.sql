-- 1. Customers cancel or ask for a return from their own order page.
--    An unpaid order cancels at once (tracked stock goes back). A paid one,
--    not yet shipped, becomes a cancellation request: money has to go back,
--    so the shop decides. A delivered order can get a return request for
--    chosen items, within store_settings.return_days of delivery (0 = the
--    shop takes no returns). One open request per order. The shop accepts
--    (and records the refund) or declines with a reply the customer sees.
-- 2. Products get brand, type and tags, edited in the admin. Brand starts
--    from the name-based guess the shop already shows (backfilled by a
--    script, not here).
--
-- Depends on 0013, 0017, 0020. Safe to re-run.

-- ---------------------------------------------------------------- 1. requests

alter table public.store_settings
  add column if not exists return_days int not null default 7 check (return_days between 0 and 90);

create table if not exists public.order_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null check (kind in ('cancel', 'return')),
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'withdrawn')),
  reason text not null default '',
  -- for a return: [{ "item": "<order_item id>", "qty": 1 }]
  items jsonb not null default '[]',
  reply text not null default '',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);
create index if not exists order_requests_order_idx on public.order_requests (order_id);
create unique index if not exists order_requests_one_open on public.order_requests (order_id) where status = 'open';

alter table public.order_requests enable row level security;
drop policy if exists "read own requests" on public.order_requests;
create policy "read own requests" on public.order_requests
  for select to authenticated
  using (public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.profile_id = (select auth.uid())));
revoke all on public.order_requests from anon, authenticated;
grant select on public.order_requests to authenticated;

-- the customer's cancel button: 'cancelled' (done) or 'requested' (shop decides)
create or replace function public.customer_cancel_order(p_order uuid, p_reason text default '')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  why text := left(coalesce(trim(p_reason), ''), 500);
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.profile_id is distinct from (select auth.uid()) then
    raise exception 'Order not found.';
  end if;
  if exists (select 1 from public.order_requests where order_id = p_order and status = 'open') then
    raise exception 'You''ve already asked about this order. The shop will get back to you.';
  end if;

  if o.status = 'pending' then
    perform set_config('babajee.stock_reason', 'cancel', true);
    perform set_config('babajee.order_id', p_order::text, true);
    update public.product_variants pv
       set stock_qty = pv.stock_qty + oi.qty
      from (select variant_id, sum(quantity)::int qty from public.order_items
             where order_id = p_order and variant_id is not null group by variant_id) oi
     where pv.id = oi.variant_id and pv.track_stock;
    perform set_config('babajee.event_note', concat_ws(' · ', 'Cancelled by the customer', nullif(why, '')), true);
    update public.orders set status = 'cancelled' where id = p_order;
    perform set_config('babajee.event_note', '', true);
    perform set_config('babajee.stock_reason', '', true);
    perform set_config('babajee.order_id', '', true);
    return 'cancelled';
  elsif o.status in ('paid', 'packed') then
    insert into public.order_requests (order_id, kind, reason) values (p_order, 'cancel', why);
    insert into public.order_events (order_id, status, note, actor_id)
    values (p_order, 'request', concat_ws(' · ', 'Customer asked to cancel', nullif(why, '')), (select auth.uid()));
    return 'requested';
  elsif o.status = 'shipped' then
    raise exception 'This order is already on its way. You can ask for a return once it arrives.';
  elsif o.status = 'delivered' then
    raise exception 'This order was delivered. Ask for a return instead.';
  else
    raise exception 'This order is already %.', o.status;
  end if;
end;
$$;

-- the customer's return form: items and quantities, and why
create or replace function public.customer_request_return(p_order uuid, p_items jsonb, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  days int;
  got timestamptz;
  ln jsonb;
  it record;
  n int;
  done_qty int;
  clean jsonb := '[]'::jsonb;
  what text[] := '{}';
  why text := left(coalesce(trim(p_reason), ''), 500);
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.profile_id is distinct from (select auth.uid()) then
    raise exception 'Order not found.';
  end if;
  if o.status <> 'delivered' then
    raise exception 'Returns open once the order has been delivered.';
  end if;
  if exists (select 1 from public.order_requests where order_id = p_order and status = 'open') then
    raise exception 'You''ve already asked about this order. The shop will get back to you.';
  end if;
  select coalesce(st.return_days, 7) into days from public.store_settings st where st.id = 1;
  if coalesce(days, 7) = 0 then
    raise exception 'This shop doesn''t take returns. Get in touch if something is wrong with your order.';
  end if;
  got := coalesce((select max(delivered_at) from public.shipments where order_id = p_order),
                  (select max(created_at) from public.order_events where order_id = p_order and status = 'delivered'));
  if got is not null and now() > got + make_interval(days => days) then
    raise exception 'Returns close % days after delivery, so this order can''t be returned any more.', days;
  end if;
  if why = '' then
    raise exception 'Say what''s wrong, so the shop can help.';
  end if;

  for ln in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    n := coalesce((ln ->> 'qty')::int, 0);
    continue when n = 0;
    select * into it from public.order_items where id = (ln ->> 'item')::uuid and order_id = p_order;
    if it.id is null then
      raise exception 'That item is not on this order.';
    end if;
    select coalesce(sum(quantity), 0) into done_qty from public.order_refund_items where order_item_id = it.id;
    if n < 0 or n > it.quantity - done_qty then
      raise exception 'Only % of % can be returned.', it.quantity - done_qty, it.product_name;
    end if;
    clean := clean || jsonb_build_object('item', it.id, 'qty', n);
    what := what || (it.product_name || case when n > 1 then ' ×' || n else '' end);
  end loop;
  if jsonb_array_length(clean) = 0 then
    raise exception 'Pick what you''d like to return.';
  end if;

  insert into public.order_requests (order_id, kind, reason, items) values (p_order, 'return', why, clean);
  insert into public.order_events (order_id, status, note, actor_id)
  values (p_order, 'request', 'Customer asked to return ' || array_to_string(what, ', ') || ' · ' || why, (select auth.uid()));
end;
$$;

create or replace function public.customer_withdraw_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  select q.*, o.profile_id into r from public.order_requests q join public.orders o on o.id = q.order_id where q.id = p_request for update of q;
  if r.id is null or r.profile_id is distinct from (select auth.uid()) then
    raise exception 'Request not found.';
  end if;
  if r.status <> 'open' then
    raise exception 'The shop has already answered this.';
  end if;
  update public.order_requests set status = 'withdrawn', resolved_at = now() where id = p_request;
  insert into public.order_events (order_id, status, note, actor_id)
  values (r.order_id, 'request', 'Customer withdrew their ' || case when r.kind = 'cancel' then 'cancellation' else 'return' end || ' request', (select auth.uid()));
end;
$$;

-- the shop's answer; accepting comes after the refund or cancellation is recorded
create or replace function public.admin_resolve_request(p_request uuid, p_accept boolean, p_reply text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  msg text := left(coalesce(trim(p_reply), ''), 500);
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  select * into r from public.order_requests where id = p_request for update;
  if r.id is null then
    raise exception 'Request not found.';
  end if;
  if r.status <> 'open' then
    raise exception 'This request is already %.', r.status;
  end if;
  if not p_accept and msg = '' then
    raise exception 'Tell the customer why, so they know what to do next.';
  end if;
  update public.order_requests
     set status = case when p_accept then 'accepted' else 'declined' end,
         reply = msg, resolved_at = now(), resolved_by = (select auth.uid())
   where id = p_request;
  insert into public.order_events (order_id, status, note, actor_id)
  values (r.order_id, 'request',
          concat_ws(' · ', case when p_accept then 'Accepted' else 'Declined' end || ' the ' || case when r.kind = 'cancel' then 'cancellation' else 'return' end || ' request', nullif(msg, '')),
          (select auth.uid()));
end;
$$;

revoke all on function public.customer_cancel_order(uuid, text) from public, anon;
revoke all on function public.customer_request_return(uuid, jsonb, text) from public, anon;
revoke all on function public.customer_withdraw_request(uuid) from public, anon;
revoke all on function public.admin_resolve_request(uuid, boolean, text) from public, anon;
grant execute on function public.customer_cancel_order(uuid, text) to authenticated;
grant execute on function public.customer_request_return(uuid, jsonb, text) to authenticated;
grant execute on function public.customer_withdraw_request(uuid) to authenticated;
grant execute on function public.admin_resolve_request(uuid, boolean, text) to authenticated;

-- Home's "things to do", now with open requests
create or replace function public.admin_home_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'requests', (select count(*) from public.order_requests where status = 'open'),
    'unpaid', (select count(*) from public.orders where status = 'pending'),
    'to_pack', (select count(*) from public.orders where status = 'paid'),
    'to_ship', (select count(*) from public.orders where status = 'packed'),
    'in_transit', (select count(*) from public.orders where status = 'shipped'),
    'out_of_stock', (select count(*) from public.product_variants where track_stock and is_visible and stock_qty = 0),
    'low_stock', (select count(*) from public.product_variants where track_stock and is_visible and stock_qty between 1 and 3),
    'unpriced', (select count(*) from public.product_variants where is_visible and price = 0)
  );
end;
$$;

-- ---------------------------------------------------------------- 2. product fields

alter table public.products
  add column if not exists brand text not null default '',
  add column if not exists product_type text not null default '',
  add column if not exists tags text[] not null default '{}';
create index if not exists products_tags_idx on public.products using gin (tags);
