-- Tests for migration 0065 (box sizes per product, presets). Needs 0061.
-- Run through scripts/test-sql.sh: one transaction, rolled back.

do $$
declare
  adm uuid;
  cat uuid; p1 uuid; p2 uuid; p3 uuid;
  pr uuid;
  n int;
  got boolean;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  insert into public.categories (slug, name, sold_in_boxes) values ('zz-test-0065', 'Test 0065', true) returning id into cat;
  insert into public.products (category_id, slug, name) values (cat, 'zz-0065-a', 'A') returning id into p1;
  insert into public.products (category_id, slug, name) values (cat, 'zz-0065-b', 'B') returning id into p2;
  insert into public.products (category_id, slug, name) values (cat, 'zz-0065-c', 'C') returning id into p3;

  -- sizes_on_product, with a price
  insert into public.product_box_sizes (product_id, pieces, price) values (p1, 50, 450), (p1, 24, 230);
  if (select count(*) from public.product_box_sizes where product_id = p1) <> 2 then raise exception 'FAIL: sizes_on_product'; end if;
  got := false;
  begin
    insert into public.product_box_sizes (product_id, pieces) values (p1, 1);
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: size_of_one_refused'; end if;

  -- preset_to_products: sizes added, existing ones left alone (price kept)
  insert into public.box_presets (name, sizes) values ('Papers', array[50, 100]) returning id into pr;
  n := public.admin_apply_box_preset(pr, array[p1, p2]);
  if n <> 3 then raise exception 'FAIL: preset_to_products added % (want 3)', n; end if;
  if (select price from public.product_box_sizes where product_id = p1 and pieces = 50) <> 450 then raise exception 'FAIL: preset_keeps_price'; end if;

  -- preset_to_category
  n := public.admin_apply_box_preset(pr, null, cat);
  if n <> 2 then raise exception 'FAIL: preset_to_category added % (want 2, only C)', n; end if;
  if (select count(*) from public.product_box_sizes where product_id = p3) <> 2 then raise exception 'FAIL: preset_to_category sizes'; end if;

  -- preset_rules
  got := false;
  begin
    insert into public.box_presets (name, sizes) values ('papers', array[10]);
  exception when unique_violation then got := true; end;
  if not got then raise exception 'FAIL: preset_name_unique'; end if;
  got := false;
  begin
    insert into public.box_presets (name, sizes) values ('Bad', array[1]);
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: preset_size_one_refused'; end if;

  -- shoppers_cant_read
  set local role anon;
  begin
    select count(*) into n from public.product_box_sizes;
    reset role;
    raise exception 'FAIL: shoppers_cant_read';
  exception when insufficient_privilege then reset role; end;
end $$;
