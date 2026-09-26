-- Carts (signed-in customers), orders, order items, status history, payments
-- and shipments. Depends on 0001 (profiles) and 0003 (product_variants).
--
-- Guest checkout: an order can have profile_id = null, and always keeps its
-- own contact_email/contact_phone/address fields, so it never depends on an
-- account existing. A guest cart lives in the browser (see src/lib/cart.ts)
-- and is only turned into cart/cart_items rows for a signed-in customer.

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists carts_touch_updated_at on public.carts;
create trigger carts_touch_updated_at
  before update on public.carts
  for each row execute function public.touch_updated_at();

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  quantity int not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (cart_id, variant_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('BJ-' || to_char(now(), 'YYMMDD') || '-' || lpad((floor(random() * 100000))::text, 5, '0')),
  profile_id uuid references public.profiles (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'packed', 'shipped', 'delivered', 'cancelled', 'refunded')),
  contact_name text not null,
  contact_email text not null,
  contact_phone text not null,
  -- Address copied at checkout, not a foreign key: it must not change if the
  -- customer edits or deletes the saved address later.
  address_line1 text not null,
  address_line2 text not null default '',
  address_landmark text not null default '',
  address_city text not null,
  address_state text not null,
  address_pincode text not null,
  address_country text not null default 'India',
  subtotal_paise int not null check (subtotal_paise >= 0),
  shipping_paise int not null default 0 check (shipping_paise >= 0),
  tax_paise int not null default 0 check (tax_paise >= 0),
  total_paise int not null check (total_paise >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_profile_id_idx on public.orders (profile_id);
create index if not exists orders_status_idx on public.orders (status);

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

-- Snapshot of the variant at sale time: name, SKU and price are copied here
-- so a later catalogue edit never rewrites what was actually sold.
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_name text not null,
  variant_label text not null default '',
  sku text,
  unit_price_paise int not null check (unit_price_paise >= 0),
  quantity int not null check (quantity > 0)
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  status text not null,
  note text not null default '',
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_id_idx on public.order_events (order_id);

-- Written by server-side code only (the checkout function / payment webhook),
-- never directly from the browser -- see the grants below.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null default 'razorpay',
  provider_ref text,
  amount_paise int not null check (amount_paise >= 0),
  status text not null default 'created'
    check (status in ('created', 'authorized', 'captured', 'failed', 'refunded')),
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payments_order_id_idx on public.payments (order_id);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  carrier text,
  tracking_number text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists shipments_order_id_idx on public.shipments (order_id);

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.payments enable row level security;
alter table public.shipments enable row level security;

drop policy if exists "manage own cart" on public.carts;
create policy "manage own cart" on public.carts
  for all to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

drop policy if exists "manage own cart items" on public.cart_items;
create policy "manage own cart items" on public.cart_items
  for all to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.profile_id = (select auth.uid())))
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.profile_id = (select auth.uid())));

drop policy if exists "read own orders" on public.orders;
create policy "read own orders" on public.orders
  for select to authenticated
  using ((select auth.uid()) = profile_id or public.is_admin());

drop policy if exists "admins update orders" on public.orders;
create policy "admins update orders" on public.orders
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "read own order items" on public.order_items;
create policy "read own order items" on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (o.profile_id = (select auth.uid()) or public.is_admin())
  ));

drop policy if exists "read own order events" on public.order_events;
create policy "read own order events" on public.order_events
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (o.profile_id = (select auth.uid()) or public.is_admin())
  ));

drop policy if exists "admins write order events" on public.order_events;
create policy "admins write order events" on public.order_events
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "read own payments" on public.payments;
create policy "read own payments" on public.payments
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (o.profile_id = (select auth.uid()) or public.is_admin())
  ));

drop policy if exists "read own shipments" on public.shipments;
create policy "read own shipments" on public.shipments
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (o.profile_id = (select auth.uid()) or public.is_admin())
  ));

drop policy if exists "admins write shipments" on public.shipments;
create policy "admins write shipments" on public.shipments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.carts, public.cart_items from anon;
grant select, insert, update, delete on public.carts, public.cart_items to authenticated;

-- orders/order_items are placed by a server-side checkout function (definer
-- rights), not by direct browser inserts -- customers and admins only ever
-- SELECT (and admins UPDATE orders for status). No INSERT/DELETE grants here.
revoke all on public.orders, public.order_items, public.order_events, public.payments, public.shipments
  from anon, authenticated;
grant select on public.orders, public.order_items, public.order_events, public.payments, public.shipments
  to authenticated;
grant update (status) on public.orders to authenticated;
grant insert on public.order_events to authenticated;
grant all on public.shipments to authenticated;

-- Verify:
--   select count(*) from pg_tables where schemaname='public' and tablename in
--     ('carts','cart_items','orders','order_items','order_events','payments','shipments');  -- 7
--   select policyname from pg_policies where tablename='orders' order by 1;                   -- 2 rows
--   insert into public.orders (contact_name, contact_email, contact_phone, address_line1,
--     address_city, address_state, address_pincode, subtotal_paise, total_paise)
--     values ('Test','t@example.com','9999999999','1 MG Road','Pune','MH','411001',10000,10000)
--     returning order_number;   -- BJ-YYMMDD-##### ; then delete it: delete from public.orders where contact_email='t@example.com';
