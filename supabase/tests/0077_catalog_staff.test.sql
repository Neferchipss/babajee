-- Tests for 0077 (storefront manager on products, stock and purchases; admin
-- design per person). Rolled back. Empty response: passed.
do $$
declare
  sf uuid; fe uuid; cu uuid;
  ids uuid[];
  cat uuid; p uuid; v uuid;
  n int;
  got boolean;
begin
  select array_agg(id) into ids from (select id from public.profiles where role = 'customer' order by created_at limit 3) x;
  sf := ids[1]; fe := ids[2]; cu := ids[3];
  update public.profiles set role = 'admin', staff_role = 'storefront' where id = sf;
  update public.profiles set role = 'admin', staff_role = 'frontend' where id = fe;
  insert into public.categories (slug, name, sold_in_boxes) values ('zz-0077', 'T', true) returning id into cat;
  insert into public.products (category_id, slug, name) values (cat, 'zz-0077-p', 'P') returning id into p;
  insert into public.product_variants (product_id, label, price) values (p, 'Default', 10) returning id into v;

  -- storefront: suppliers, bills, units sold, stock correction, buying price, box sizes
  perform set_config('request.jwt.claims', json_build_object('sub', sf, 'role', 'authenticated')::text, true);
  perform public.admin_suppliers();
  perform public.admin_receipts(null, null);
  perform * from public.admin_units_sold();
  perform public.admin_correct_stock(v, 7, 'test');
  if (select stock_qty from public.product_variants where id = v) <> 7 then raise exception 'FAIL: storefront_correct_stock'; end if;
  perform public.admin_set_purchase(v, 5, 18, 'test');
  set local role authenticated;
  insert into public.product_box_sizes (product_id, pieces) values (p, 24);
  select count(*) into n from public.variant_costs where variant_id = v;
  if n <> 1 then reset role; raise exception 'FAIL: storefront_reads_costs'; end if;
  select count(*) into n from public.stock_movements where variant_id = v;
  if n < 1 then reset role; raise exception 'FAIL: storefront_reads_history'; end if;
  -- own admin design
  update public.profiles set admin_design = 'studio' where id = sf;
  reset role;
  if (select admin_design from public.profiles where id = sf) <> 'studio' then raise exception 'FAIL: own_admin_design'; end if;

  -- still closed to storefront: orders and customers
  got := false;
  begin
    perform public.admin_customers();
  exception when insufficient_privilege then got := true; end;
  if not got then raise exception 'FAIL: storefront_no_customers'; end if;

  -- front-end UI and customers: refused
  foreach cat in array array[fe, cu] loop
    perform set_config('request.jwt.claims', json_build_object('sub', cat, 'role', 'authenticated')::text, true);
    got := false;
    begin
      perform public.admin_suppliers();
    exception when insufficient_privilege then got := true; end;
    if not got then raise exception 'FAIL: % can call suppliers', cat; end if;
  end loop;

  -- a bad design value is refused
  got := false;
  begin
    update public.profiles set admin_design = 'neon' where id = sf;
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: design_checked'; end if;
end $$;
