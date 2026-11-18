-- Tests for 0078 (stock counting on/off). Rolled back. Empty response: passed.
do $$
declare
  adm uuid; cu uuid;
  cat uuid; p uuid; v uuid; b uuid;
  r record;
  got boolean;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  select id into cu from public.profiles where role = 'customer' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  insert into public.categories (slug, name, sold_in_boxes) values ('zz-0078', 'T', true) returning id into cat;
  insert into public.products (category_id, slug, name) values (cat, 'zz-0078-p', 'P') returning id into p;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (p, 'Default', 10, 0, false) returning id into v;
  insert into public.product_variants (product_id, label, price, unit_variant_id, pack_of) values (p, 'Box of 10', 90, v, 10) returning id into b;

  -- on, then the box follows; history has a line
  perform public.admin_set_counting(v, true, 'test');
  if not (select track_stock from public.product_variants where id = v) then raise exception 'FAIL: counting_on'; end if;
  if not (select track_stock from public.product_variants where id = b) then raise exception 'FAIL: box_follows'; end if;
  if not exists (select 1 from public.stock_movements where variant_id = v and note like 'Started counting stock%') then raise exception 'FAIL: history_line'; end if;

  -- off keeps the number
  perform public.admin_correct_stock(v, 25, 'count');
  perform public.admin_set_counting(v, false);
  select track_stock, stock_qty into r from public.product_variants where id = v;
  if r.track_stock or r.stock_qty <> 25 then raise exception 'FAIL: counting_off_keeps (% %)', r.track_stock, r.stock_qty; end if;

  -- a box can't be set on its own
  got := false;
  begin
    perform public.admin_set_counting(b, true);
  exception when others then got := sqlerrm like 'A box follows%'; end;
  if not got then raise exception 'FAIL: box_refused'; end if;

  -- customers can't
  perform set_config('request.jwt.claims', json_build_object('sub', cu, 'role', 'authenticated')::text, true);
  got := false;
  begin
    perform public.admin_set_counting(v, true);
  exception when insufficient_privilege then got := true; end;
  if not got then raise exception 'FAIL: customer_refused'; end if;
end $$;
