-- The storefront manager works on everything about a product (client
-- decision): tax, buying prices, stock, boxes, purchase bills and suppliers,
-- as well as the catalogue it already had (0072). Orders, customers, money
-- reports and settings stay closed to it. And each person's admin design is
-- saved on their account, so it follows them to any device.
--
-- 1. Tables the product, stock and purchase screens read directly get a
--    "catalog staff" rule (staff_can('catalog'): owner, admin, store account,
--    storefront manager): box sizes and presets (read and write), buying
--    prices, stock history, suppliers, bills and bill lines, price
--    corrections (read).
-- 2. The functions those screens call check staff_can('catalog') instead of
--    is_admin(). Each function's own definition is rewritten in place, so
--    nothing else in it changes. Re-run safe: a rewritten one no longer
--    mentions is_admin().
-- 3. profiles.admin_design: the person's admin design (null = Current).
--
-- Depends on 0050, 0059, 0061, 0064, 0065, 0070, 0072.

-- ---------------------------------------------------------------- 1. tables
do $$
declare
  t text;
begin
  foreach t in array array['product_box_sizes', 'box_presets'] loop
    execute format('drop policy if exists "catalog staff" on public.%I', t);
    execute format('create policy "catalog staff" on public.%I for all to authenticated using (public.staff_can(''catalog'')) with check (public.staff_can(''catalog''))', t);
  end loop;
  foreach t in array array['variant_costs', 'stock_movements', 'suppliers', 'stock_receipts', 'stock_receipt_lines', 'purchase_corrections'] loop
    execute format('drop policy if exists "catalog staff read" on public.%I', t);
    execute format('create policy "catalog staff read" on public.%I for select to authenticated using (public.staff_can(''catalog''))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- 2. functions
do $$
declare
  f record;
  def text;
begin
  for f in
    select p.oid
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('admin_apply_box_preset', 'admin_refresh_collection', 'admin_units_sold', 'admin_set_purchase',
                         'admin_correct_stock', 'admin_post_receipt', 'admin_suppliers', 'admin_save_supplier', 'admin_receipt',
                         'admin_receipts', 'admin_void_receipt', 'admin_uncounted', 'admin_track_all_stock',
                         'admin_set_receipt_flags', 'admin_low_stock')
  loop
    def := pg_get_functiondef(f.oid);
    if position('public.is_admin()' in def) > 0 then
      execute replace(def, 'public.is_admin()', 'public.staff_can(''catalog'')');
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- 3. admin design per person
alter table public.profiles add column if not exists admin_design text;
alter table public.profiles drop constraint if exists profiles_admin_design_check;
alter table public.profiles add constraint profiles_admin_design_check
  check (admin_design is null or admin_design in ('current', 'shopify', 'ease', 'studio'));
grant update (admin_design) on public.profiles to authenticated;
