-- Tests for migration 0071 (bundles). Needs 0059-0061. Rolled back. Empty: passed.
do $$
declare
  adm uuid;
  cat uuid; pa uuid; pb uuid; pk uuid;
  a uuid; b uuid; kit uuid; abox uuid;
  o uuid;
  got boolean;
  l record;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  insert into public.categories (slug, name) values ('zz-0071', 'Test 0071') returning id into cat;
  insert into public.products (category_id, slug, name) values (cat, 'zz-0071-a', 'Grinder Zq') returning id into pa;
  insert into public.products (category_id, slug, name) values (cat, 'zz-0071-b', 'Papers Zq') returning id into pb;
  insert into public.products (category_id, slug, name) values (cat, 'zz-0071-kit', 'Starter kit Zq') returning id into pk;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (pa, 'Default', 500, 10, true) returning id into a;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (pb, 'Default', 50, 7, true) returning id into b;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (pk, 'Default', 549, 0, false) returning id into kit;
  perform public.admin_set_purchase(a, 300, 18, 'typed');
  perform public.admin_set_purchase(b, 20, 12, 'typed');

  -- stock_from_components: 1 grinder + 2 papers -> min(10, 3) = 3
  insert into public.bundle_items (bundle_variant_id, component_variant_id, qty) values (kit, a, 1), (kit, b, 2);
  select stock_qty, track_stock into l from public.product_variants where id = kit;
  if not (l.stock_qty = 3 and l.track_stock) then raise exception 'FAIL: stock_from_components (% %)', l.stock_qty, l.track_stock; end if;

  -- cost_is_sum: 354 + 2 x 22.4 = 398.80
  if (select cost from public.variant_costs where variant_id = kit) <> 398.80 then raise exception 'FAIL: cost_is_sum (%)', (select cost from public.variant_costs where variant_id = kit); end if;

  -- component_moves_bundle
  update public.product_variants set stock_qty = 11 where id = b;
  if (select stock_qty from public.product_variants where id = kit) <> 5 then raise exception 'FAIL: component_moves_bundle'; end if;

  -- checkout_a_bundle: the shop's checkout sells 2 kits -> 2 grinders, 4 papers off
  update public.products set is_visible = true, status = 'published' where id in (pa, pb, pk);
  select x.order_id into o from public.place_order(
    jsonb_build_array(jsonb_build_object('slug', 'zz-0071-kit', 'variant', 'Default', 'qty', 2)),
    jsonb_build_object('recipient_name', 'T', 'phone', '9999999999', 'line1', 'x', 'city', 'Pune', 'state', 'Maharashtra', 'pincode', '411001'), '') x;
  if (select stock_qty from public.product_variants where id = a) <> 8 or (select stock_qty from public.product_variants where id = b) <> 7 then
    raise exception 'FAIL: checkout_a_bundle (% %)', (select stock_qty from public.product_variants where id = a), (select stock_qty from public.product_variants where id = b); end if;
  if (select stock_qty from public.product_variants where id = kit) <> 3 then raise exception 'FAIL: bundle_after_sale'; end if;
  if exists (select 1 from public.stock_movements where variant_id = kit) then raise exception 'FAIL: history_on_components_only'; end if;
  if (select count(*) from public.stock_movements where variant_id in (a, b) and order_id = o) <> 2 then raise exception 'FAIL: components_history'; end if;
  if (select ic.unit_cost from public.order_items i join public.order_item_costs ic on ic.order_item_id = i.id where i.order_id = o) <> 398.80 then raise exception 'FAIL: sale_cost'; end if;

  -- too_many_refused
  got := false;
  begin
    perform public.place_order(jsonb_build_array(jsonb_build_object('slug', 'zz-0071-kit', 'variant', 'Default', 'qty', 9)),
      jsonb_build_object('recipient_name', 'T', 'phone', '9999999999', 'line1', 'x', 'city', 'Pune', 'state', 'Maharashtra', 'pincode', '411001'), '');
  exception when others then got := sqlerrm like 'Only 3 left%'; end;
  if not got then raise exception 'FAIL: too_many_refused'; end if;

  -- rules: no boxes, no bundles in bundles, not itself
  insert into public.product_variants (product_id, label, price, unit_variant_id, pack_of) values (pa, 'Box of 5', 2000, a, 5) returning id into abox;
  got := false;
  begin
    insert into public.bundle_items (bundle_variant_id, component_variant_id) values (kit, abox);
  exception when others then got := sqlerrm like '%not boxes%'; end;
  if not got then raise exception 'FAIL: no_boxes'; end if;
  got := false;
  begin
    insert into public.bundle_items (bundle_variant_id, component_variant_id) values (a, kit);
  exception when others then got := sqlerrm like '%another bundle%' or sqlerrm like '%already inside%'; end;
  if not got then raise exception 'FAIL: no_nesting'; end if;
  got := false;
  begin
    perform public.admin_set_purchase(kit, 400, 18, 'typed');
  exception when others then got := sqlerrm like '%bundle%'; end;
  if not got then raise exception 'FAIL: no_bundle_purchase'; end if;

  -- emptied bundle: plain option again
  delete from public.bundle_items where bundle_variant_id = kit;
  if exists (select 1 from public.variant_costs where variant_id = kit) then raise exception 'FAIL: emptied_cost'; end if;
end $$;
