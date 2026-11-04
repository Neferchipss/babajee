-- Per option: a barcode and a compare-at price (the higher "was" price the
-- shop strikes through, with "₹x OFF"). The SKU column has been there since
-- 0003 (unique); this lets the admin edit it and keeps empty ones as null so
-- uniqueness only applies to real codes. Safe to re-run.

alter table public.product_variants add column if not exists barcode text;
alter table public.product_variants add column if not exists compare_at numeric(10, 2);

alter table public.product_variants drop constraint if exists product_variants_compare_at_check;
alter table public.product_variants add constraint product_variants_compare_at_check check (compare_at is null or compare_at >= 0);

-- "" and "  " become null, and codes are kept trimmed and upper-case
create or replace function public.tidy_variant_codes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.sku := nullif(upper(trim(coalesce(new.sku, ''))), '');
  new.barcode := nullif(trim(coalesce(new.barcode, '')), '');
  if new.compare_at = 0 then
    new.compare_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists product_variants_tidy_codes on public.product_variants;
create trigger product_variants_tidy_codes
  before insert or update of sku, barcode, compare_at on public.product_variants
  for each row execute function public.tidy_variant_codes();
