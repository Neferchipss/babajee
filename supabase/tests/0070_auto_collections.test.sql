-- Tests for migration 0070 (rule-based collections). Rolled back. Empty: passed.
do $$
declare
  adm uuid;
  cat uuid; p1 uuid; p2 uuid; p3 uuid; col uuid;
  n int;
  got boolean;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  insert into public.categories (slug, name) values ('zz-0070', 'Test 0070') returning id into cat;
  insert into public.products (category_id, slug, name, brand) values (cat, 'zz-0070-a', 'Glass Beaker Zq', 'Zqbrand') returning id into p1;
  insert into public.products (category_id, slug, name, brand) values (cat, 'zz-0070-b', 'Acrylic Zq', 'Other') returning id into p2;
  insert into public.products (category_id, slug, name, brand, status) values (cat, 'zz-0070-c', 'Glass Draft Zq', 'Zqbrand', 'draft') returning id into p3;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (p1, 'Default', 1500, 3, true), (p2, 'Default', 900, 0, true), (p3, 'Default', 100, 5, true);

  -- category + price under, all: only A? A is 1500 (not under 1000), B 900 -> B
  insert into public.collections (slug, name, mode, rules, match, sort)
  values ('zz-0070-col', 'Cheap test', 'auto', jsonb_build_array(jsonb_build_object('field', 'category', 'op', 'is', 'value', 'zz-0070'), jsonb_build_object('field', 'price', 'op', 'under', 'value', '1000')), 'all', 'price_asc')
  returning id into col;
  if (select array_agg(product_id) from public.collection_items where collection_id = col) is distinct from array[p2] then raise exception 'FAIL: fills_on_save'; end if;

  -- a price change moves it in (statement trigger)
  update public.product_variants set price = 800 where product_id = p1;
  if (select count(*) from public.collection_items where collection_id = col) <> 2 then raise exception 'FAIL: follows_price'; end if;
  -- price_asc order: A 800 first, B 900
  if (select product_id from public.collection_items where collection_id = col and position = 0) <> p1 then raise exception 'FAIL: sorted_by_price'; end if;

  -- in_stock + any; drafts never in
  update public.collections set rules = jsonb_build_array(jsonb_build_object('field', 'name', 'op', 'contains', 'value', 'glass zq'), jsonb_build_object('field', 'brand', 'op', 'is', 'value', 'zqbrand')), match = 'any' where id = col;
  if (select count(*) from public.collection_items where collection_id = col) <> 1 then raise exception 'FAIL: any_and_no_drafts (%)', (select count(*) from public.collection_items where collection_id = col); end if;
  update public.collections set rules = jsonb_build_array(jsonb_build_object('field', 'category', 'op', 'is', 'value', 'zz-0070'), jsonb_build_object('field', 'in_stock', 'op', 'is', 'value', true)), match = 'all' where id = col;
  if (select array_agg(product_id) from public.collection_items where collection_id = col) is distinct from array[p1] then raise exception 'FAIL: in_stock'; end if;

  -- max_items, new_days
  update public.collections set rules = jsonb_build_array(jsonb_build_object('field', 'new_days', 'op', 'within', 'value', 1), jsonb_build_object('field', 'category', 'op', 'is', 'value', 'zz-0070')), max_items = 1, sort = 'name' where id = col;
  if (select count(*) from public.collection_items where collection_id = col) <> 1 then raise exception 'FAIL: max_items'; end if;

  -- manual collections untouched
  update public.collections set mode = 'manual' where id = col;
  update public.product_variants set price = 700 where product_id = p2;
  if (select count(*) from public.collection_items where collection_id = col) <> 1 then raise exception 'FAIL: manual_untouched'; end if;

  -- bad values refused
  got := false;
  begin
    update public.collections set sort = 'random' where id = col;
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: checked'; end if;

  n := public.admin_refresh_collection(col);
end $$;
