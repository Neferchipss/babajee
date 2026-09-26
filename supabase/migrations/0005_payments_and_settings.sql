-- Follow-up to 0004_orders.sql: no guest checkout (an order always belongs to
-- a signed-in customer), and payment starts as a manual bank transfer until a
-- gateway is chosen. Depends on 0001, 0003, 0004.

-- An order must be placed by a signed-in customer. Kept as "on delete
-- restrict", not "not null", so a customer account can never be hard-deleted
-- while their order history still exists -- deactivate the profile instead.
alter table public.orders
  drop constraint if exists orders_profile_id_fkey,
  add constraint orders_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete restrict;

comment on column public.orders.profile_id is
  'Required at checkout time (enforced by the checkout function, not this column, so order history can outlive a removed account).';

-- Manual bank transfer: the customer places the order, transfers the money
-- themself, and enters the bank's reference number. It sits as
-- "awaiting_confirmation" until an admin checks the bank statement and marks
-- it paid. Swap in a gateway later by adding new provider/status values.
alter table public.payments
  alter column provider set default 'bank_transfer',
  add column if not exists customer_reference text;

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('awaiting_confirmation', 'captured', 'failed', 'refunded'));

alter table public.payments alter column status set default 'awaiting_confirmation';

-- Store-wide settings the admin can change without a code deploy: bank
-- transfer details shown at checkout, shipping fee, free-shipping threshold.
-- One row, id fixed at 1.
create table if not exists public.store_settings (
  id int primary key default 1 check (id = 1),
  bank_account_name text not null default '',
  bank_account_number text not null default '',
  bank_ifsc text not null default '',
  bank_upi_id text not null default '',
  shipping_paise int not null default 0 check (shipping_paise >= 0),
  free_shipping_over_paise int,
  updated_at timestamptz not null default now()
);

insert into public.store_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists store_settings_touch_updated_at on public.store_settings;
create trigger store_settings_touch_updated_at
  before update on public.store_settings
  for each row execute function public.touch_updated_at();

alter table public.store_settings enable row level security;

-- Readable by anyone (the checkout page needs the bank details and the
-- shipping fee before the customer logs in), writable only by admins.
drop policy if exists "read store settings" on public.store_settings;
create policy "read store settings" on public.store_settings
  for select to anon, authenticated
  using (true);

drop policy if exists "admins write store settings" on public.store_settings;
create policy "admins write store settings" on public.store_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.store_settings from anon, authenticated;
grant select on public.store_settings to anon, authenticated;
grant update on public.store_settings to authenticated;

-- Verify:
--   select confdeltype from pg_constraint where conname = 'orders_profile_id_fkey';         -- 'r' (restrict)
--   select column_default from information_schema.columns
--     where table_name='payments' and column_name in ('provider','status');                 -- bank_transfer, awaiting_confirmation
--   select * from public.store_settings;                                                    -- 1 row, id = 1
--   select policyname from pg_policies where tablename = 'store_settings' order by 1;        -- 2 rows
