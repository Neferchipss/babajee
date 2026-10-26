-- Map pin and a Home / Work / Other tag on saved addresses. The pin is where
-- the customer dropped it on the map, so delivery has the exact spot even
-- when the typed address is vague. Orders copy it at checkout, like the rest
-- of the address (see 0004).

alter table public.addresses
  add column if not exists label text not null default 'Home',
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.addresses drop constraint if exists addresses_label_check;
alter table public.addresses
  add constraint addresses_label_check check (label in ('Home', 'Work', 'Other'));

alter table public.addresses drop constraint if exists addresses_pin_check;
alter table public.addresses
  add constraint addresses_pin_check check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  );

alter table public.orders
  add column if not exists address_latitude double precision,
  add column if not exists address_longitude double precision;

-- Verify:
--   select column_name from information_schema.columns
--   where table_name = 'addresses' and column_name in ('label', 'latitude', 'longitude');  -- 3 rows
