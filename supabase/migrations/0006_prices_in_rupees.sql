-- Switch all money columns from integer paise to numeric rupees (numeric is
-- exact, not floating point, so no accuracy is lost). Tables are still empty,
-- so this is a straight rename + type change, no data to convert.

alter table public.product_variants
  rename column price_paise to price;
alter table public.product_variants
  alter column price type numeric(10, 2) using price::numeric(10, 2);
alter table public.product_variants
  drop constraint if exists product_variants_price_paise_check,
  add constraint product_variants_price_check check (price >= 0);

alter table public.order_items
  rename column unit_price_paise to unit_price;
alter table public.order_items
  alter column unit_price type numeric(10, 2) using unit_price::numeric(10, 2);
alter table public.order_items
  drop constraint if exists order_items_unit_price_paise_check,
  add constraint order_items_unit_price_check check (unit_price >= 0);

alter table public.orders
  rename column subtotal_paise to subtotal;
alter table public.orders
  rename column shipping_paise to shipping;
alter table public.orders
  rename column tax_paise to tax;
alter table public.orders
  rename column total_paise to total;
alter table public.orders
  alter column subtotal type numeric(10, 2) using subtotal::numeric(10, 2),
  alter column shipping type numeric(10, 2) using shipping::numeric(10, 2),
  alter column tax type numeric(10, 2) using tax::numeric(10, 2),
  alter column total type numeric(10, 2) using total::numeric(10, 2);
alter table public.orders
  drop constraint if exists orders_subtotal_paise_check,
  drop constraint if exists orders_shipping_paise_check,
  drop constraint if exists orders_tax_paise_check,
  drop constraint if exists orders_total_paise_check,
  add constraint orders_subtotal_check check (subtotal >= 0),
  add constraint orders_shipping_check check (shipping >= 0),
  add constraint orders_tax_check check (tax >= 0),
  add constraint orders_total_check check (total >= 0);

alter table public.payments
  rename column amount_paise to amount;
alter table public.payments
  alter column amount type numeric(10, 2) using amount::numeric(10, 2);
alter table public.payments
  drop constraint if exists payments_amount_paise_check,
  add constraint payments_amount_check check (amount >= 0);

alter table public.store_settings
  rename column shipping_paise to shipping;
alter table public.store_settings
  rename column free_shipping_over_paise to free_shipping_over;
alter table public.store_settings
  alter column shipping type numeric(10, 2) using shipping::numeric(10, 2),
  alter column free_shipping_over type numeric(10, 2) using free_shipping_over::numeric(10, 2);
alter table public.store_settings
  drop constraint if exists store_settings_shipping_paise_check,
  add constraint store_settings_shipping_check check (shipping >= 0);

-- The demo order number generator in 0004 does not touch money columns, so
-- it needs no change. New default order_number values still work as before.

-- Verify:
--   select table_name, column_name, data_type from information_schema.columns
--     where table_schema='public' and column_name in
--     ('price','unit_price','subtotal','shipping','tax','total','amount','free_shipping_over')
--     order by 1, 2;
--   -- every row should say data_type = 'numeric', and no *_paise column should remain:
--   select table_name, column_name from information_schema.columns
--     where table_schema='public' and column_name like '%_paise';   -- 0 rows
