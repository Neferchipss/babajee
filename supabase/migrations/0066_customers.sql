-- Customers: first and last name, gender, individual or business (with its
-- name and GSTIN), account status, and a billing address apart from the
-- shipping one.
--
-- 1. profiles: first_name, last_name (full_name follows them; a full name
--    given on its own, as sign-up does (0058), is split into them), gender,
--    customer_type, business_name, gstin, status (active / inactive /
--    blocked) and status_note. Customers change their own name, gender and
--    business details; only the shop changes status (admin_update_customer).
-- 2. A blocked customer can't place an order: the database refuses it,
--    whatever the screen does. An order the shop takes for them still goes
--    through.
-- 3. addresses.is_default_billing: one default billing address per
--    customer, beside is_default (the shipping one).
-- 4. orders: the billing address (billing_* columns; empty: same as
--    shipping), set by the customer on their own pending order
--    (set_order_billing) or by the shop. A business customer's GSTIN goes on
--    their orders by itself (buyer_gstin, 0051).
--
-- Re-run safe.

-- ---------------------------------------------------------------- 1. profiles

alter table public.profiles add column if not exists first_name text not null default '';
alter table public.profiles add column if not exists last_name text not null default '';
alter table public.profiles add column if not exists gender text not null default '';
alter table public.profiles add column if not exists customer_type text not null default 'individual';
alter table public.profiles add column if not exists business_name text not null default '';
alter table public.profiles add column if not exists gstin text not null default '';
alter table public.profiles add column if not exists status text not null default 'active';
alter table public.profiles add column if not exists status_note text not null default '';

alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles add constraint profiles_gender_check check (gender in ('', 'female', 'male', 'other'));
alter table public.profiles drop constraint if exists profiles_customer_type_check;
alter table public.profiles add constraint profiles_customer_type_check check (customer_type in ('individual', 'business'));
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check check (status in ('active', 'inactive', 'blocked'));
alter table public.profiles drop constraint if exists profiles_gstin_format;
alter table public.profiles add constraint profiles_gstin_format
  check (gstin = '' or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');

-- names: first + last make the full name; a full name alone is split (first
-- word, the rest). GSTIN upper-case, trimmed.
create or replace function public.profiles_names()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.first_name := btrim(coalesce(new.first_name, ''));
  new.last_name := btrim(coalesce(new.last_name, ''));
  new.gstin := upper(btrim(coalesce(new.gstin, '')));
  new.business_name := btrim(coalesce(new.business_name, ''));
  if tg_op = 'INSERT' or new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name then
    if new.first_name <> '' or new.last_name <> '' then
      new.full_name := btrim(new.first_name || ' ' || new.last_name);
      return new;
    end if;
  end if;
  if (tg_op = 'INSERT' or new.full_name is distinct from old.full_name) and btrim(coalesce(new.full_name, '')) <> '' then
    new.full_name := btrim(new.full_name);
    new.first_name := split_part(new.full_name, ' ', 1);
    new.last_name := btrim(substr(new.full_name, length(new.first_name) + 1));
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_names on public.profiles;
create trigger profiles_names before insert or update on public.profiles
  for each row execute function public.profiles_names();

-- everyone there today: names split from their full name
update public.profiles set full_name = full_name where first_name = '' and last_name = '' and btrim(coalesce(full_name, '')) <> '';

-- what a customer may change on their own row (status is the shop's)
grant update (first_name, last_name, gender, customer_type, business_name, gstin) on public.profiles to authenticated;

-- the shop's changes to a customer: status (with a note) and the details
create or replace function public.admin_update_customer(p_customer uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if p ? 'status' and p ->> 'status' not in ('active', 'inactive', 'blocked') then
    raise exception 'Unknown status.' using errcode = '22023';
  end if;
  update public.profiles set
    first_name = coalesce(p ->> 'first_name', first_name),
    last_name = coalesce(p ->> 'last_name', last_name),
    gender = coalesce(p ->> 'gender', gender),
    customer_type = coalesce(p ->> 'customer_type', customer_type),
    business_name = coalesce(p ->> 'business_name', business_name),
    gstin = coalesce(p ->> 'gstin', gstin),
    status = coalesce(p ->> 'status', status),
    status_note = coalesce(p ->> 'status_note', status_note)
  where id = p_customer;
  if not found then
    raise exception 'Customer not found.' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.admin_update_customer(uuid, jsonb) from public, anon;
grant execute on function public.admin_update_customer(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------- 2. orders: blocked, business GSTIN

create or replace function public.orders_customer_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  if new.profile_id is null then
    return new;
  end if;
  select p.status, p.customer_type, p.gstin into c from public.profiles p where p.id = new.profile_id;
  -- a blocked customer can't order for themselves; the shop still can for them
  if c.status = 'blocked' and not public.is_admin() then
    raise exception 'This account can''t place orders. Please contact us.' using errcode = '42501';
  end if;
  -- a business customer's GSTIN goes on the order
  if coalesce(new.buyer_gstin, '') = '' and c.customer_type = 'business' and coalesce(c.gstin, '') <> '' then
    new.buyer_gstin := c.gstin;
  end if;
  return new;
end;
$$;
revoke all on function public.orders_customer_rules() from public, anon, authenticated;
drop trigger if exists orders_customer_rules on public.orders;
create trigger orders_customer_rules before insert on public.orders
  for each row execute function public.orders_customer_rules();

-- ---------------------------------------------------------------- 3. default billing address

alter table public.addresses add column if not exists is_default_billing boolean not null default false;

create or replace function public.enforce_single_default_billing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_default_billing then
    update public.addresses set is_default_billing = false
     where profile_id = new.profile_id and id <> new.id and is_default_billing;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_single_default_billing() from public, anon, authenticated;
drop trigger if exists addresses_single_default_billing on public.addresses;
create trigger addresses_single_default_billing after insert or update of is_default_billing on public.addresses
  for each row when (new.is_default_billing) execute function public.enforce_single_default_billing();

-- ---------------------------------------------------------------- 4. orders: billing address

alter table public.orders add column if not exists billing_name text not null default '';
alter table public.orders add column if not exists billing_line1 text not null default '';
alter table public.orders add column if not exists billing_line2 text not null default '';
alter table public.orders add column if not exists billing_city text not null default '';
alter table public.orders add column if not exists billing_state text not null default '';
alter table public.orders add column if not exists billing_pincode text not null default '';

-- the customer's billing address on their own order, while it's awaiting
-- payment (empty: the same as shipping); the shop can set it any time before
-- an invoice
create or replace function public.set_order_billing(p_order uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
begin
  select * into o from public.orders where id = p_order;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if not public.is_admin() and (o.profile_id is distinct from (select auth.uid()) or o.status <> 'pending') then
    raise exception 'This order''s billing address can''t be changed now.' using errcode = '42501';
  end if;
  if o.invoice_number is not null then
    raise exception 'This order is invoiced: its billing address stays as it is.' using errcode = '22023';
  end if;
  if coalesce(p ->> 'line1', '') <> '' and (coalesce(p ->> 'city', '') = '' or coalesce(p ->> 'state', '') = '' or coalesce(p ->> 'pincode', '') !~ '^[1-9][0-9]{5}$') then
    raise exception 'Add the billing address''s city, state and 6-digit pin code.' using errcode = '22023';
  end if;
  update public.orders set
    billing_name = left(btrim(coalesce(p ->> 'name', '')), 120),
    billing_line1 = left(btrim(coalesce(p ->> 'line1', '')), 200),
    billing_line2 = left(btrim(coalesce(p ->> 'line2', '')), 200),
    billing_city = left(btrim(coalesce(p ->> 'city', '')), 80),
    billing_state = left(btrim(coalesce(p ->> 'state', '')), 80),
    billing_pincode = left(btrim(coalesce(p ->> 'pincode', '')), 6)
  where id = p_order;
end;
$$;
revoke all on function public.set_order_billing(uuid, jsonb) from public, anon;
grant execute on function public.set_order_billing(uuid, jsonb) to authenticated;
