-- Tests for migration 0061 (boxes). Needs 0059 (and 0060) in place, or run
-- together with them. Run through scripts/test-sql.sh: one transaction, rolled
-- back. An empty response means every check passed.

do $$
declare
  adm uuid;
  cat uuid;
  prod uuid;
  prod2 uuid;
  pc uuid;   -- the loose pieces
  bx uuid;   -- Box of 50 of them
  other uuid;
  s_reg uuid; s_unreg uuid;
  r_box uuid; r_loose uuid;
  c record;
  l record;
  got boolean;
  n int;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  if adm is null then raise exception 'FAIL: setup (no admin profile)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  update public.store_settings set gstin = '27AAAAA0000A1Z5', gst_input_credit = true where id = 1;

  insert into public.categories (slug, name, sold_in_boxes) values ('zz-test-0058', 'Test 0058', true) returning id into cat;
  insert into public.products (category_id, slug, name, gst_rate) values (cat, 'zz-test-0058-p', 'Papers 0058', 18) returning id into prod;
  insert into public.products (category_id, slug, name, gst_rate) values (cat, 'zz-test-0058-q', 'Other 0058', 18) returning id into prod2;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (prod, 'Piece', 15, 0, false) returning id into pc;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (prod2, 'Piece', 15, 0, false) returning id into other;

  -- box_rules: a box of another product's option, or of a box, is refused
  got := false;
  begin
    insert into public.product_variants (product_id, label, price, unit_variant_id, pack_of) values (prod, 'Bad box', 1, other, 10);
  exception when others then got := sqlerrm like 'A box holds an option of its own product%'; end;
  if not got then raise exception 'FAIL: box_of_other_product_refused'; end if;
  got := false;
  begin
    insert into public.product_variants (product_id, label, price, unit_variant_id, pack_of) values (prod, 'One box', 1, pc, 1);
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: box_of_one_refused'; end if;

  insert into public.product_variants (product_id, label, price, unit_variant_id, pack_of, is_visible) values (prod, 'Box of 50', 450, pc, 50, true) returning id into bx;
  got := false;
  begin
    insert into public.product_variants (product_id, label, price, unit_variant_id, pack_of) values (prod, 'Box of boxes', 1, bx, 2);
  exception when others then got := sqlerrm like 'A box holds loose pieces%'; end;
  if not got then raise exception 'FAIL: box_of_box_refused'; end if;

  s_reg := public.admin_save_supplier(jsonb_build_object('name', 'Zz Box Registered', 'gstin', '27BBBBB1111B1Z5'));
  s_unreg := public.admin_save_supplier(jsonb_build_object('name', 'Zz Box Unregistered'));

  -- bill_in_boxes: 2 boxes at 500 + 18% -> line as billed, 100 pieces in
  r_box := public.admin_post_receipt('bill', s_reg, 'ZZB-1', current_date, '',
    jsonb_build_array(jsonb_build_object('variant_id', bx, 'qty', 2, 'unit_price', 500, 'gst_rate', 18)));
  select * into l from public.stock_receipt_lines where receipt_id = r_box;
  if not (l.variant_id = bx and l.qty = 2 and l.unit_price = 500 and l.gst = 180 and l.claimable) then raise exception 'FAIL: bill_in_boxes line'; end if;
  if not (select stock_qty = 100 and track_stock from public.product_variants where id = pc) then raise exception 'FAIL: bill_in_boxes pieces'; end if;
  if not (select stock_qty = 2 and track_stock from public.product_variants where id = bx) then raise exception 'FAIL: bill_in_boxes box'; end if;
  select * into c from public.variant_costs where variant_id = pc;
  if not (c.purchase = 10 and c.gst_paid = 1.80 and c.gst_claimable = 1.80 and c.cost = 11.80) then
    raise exception 'FAIL: bill_in_boxes piece cost (% % % %)', c.purchase, c.gst_paid, c.gst_claimable, c.cost; end if;
  select * into c from public.variant_costs where variant_id = bx;
  if not (c.purchase = 500 and c.gst_paid = 90 and c.gst_claimable = 90 and c.cost = 590) then
    raise exception 'FAIL: bill_in_boxes box cost (% % %)', c.purchase, c.gst_paid, c.cost; end if;
  -- history on the pieces only
  if not ((select count(*) from public.stock_movements where variant_id = pc and receipt_id = r_box and reason = 'stock_in' and delta = 100) = 1) then
    raise exception 'FAIL: bill_in_boxes movement'; end if;
  if exists (select 1 from public.stock_movements where variant_id = bx) then raise exception 'FAIL: box_has_no_history'; end if;

  -- bill_loose: 30 pieces at 12, unregistered (not claimable)
  -- average (100 x 10 + 30 x 12) / 130 = 10.46; GST (180 + 64.80) / 130 = 1.88;
  -- claimable (180 + 0) / 130 = 1.38
  r_loose := public.admin_post_receipt('bill', s_unreg, 'ZZB-2', current_date, '',
    jsonb_build_array(jsonb_build_object('variant_id', pc, 'qty', 30, 'unit_price', 12, 'gst_rate', 18)));
  if not (select stock_qty = 130 from public.product_variants where id = pc) then raise exception 'FAIL: bill_loose pieces'; end if;
  if not (select stock_qty = 2 from public.product_variants where id = bx) then raise exception 'FAIL: bill_loose box'; end if;
  select * into c from public.variant_costs where variant_id = pc;
  if not (c.purchase = 10.46 and c.gst_paid = 1.88 and c.gst_claimable = 1.38) then
    raise exception 'FAIL: bill_loose average (% % %)', c.purchase, c.gst_paid, c.gst_claimable; end if;
  if not ((select purchase from public.variant_costs where variant_id = bx) = 523.00) then raise exception 'FAIL: bill_loose box cost'; end if;

  -- sell_a_box: 1 box sold -> 50 pieces off, logged as a sale on the pieces
  perform set_config('babajee.stock_reason', 'sale', true);
  update public.product_variants set stock_qty = stock_qty - 1 where id = bx;
  perform set_config('babajee.stock_reason', '', true);
  if not (select stock_qty = 80 from public.product_variants where id = pc) then raise exception 'FAIL: sell_a_box pieces'; end if;
  if not (select stock_qty = 1 from public.product_variants where id = bx) then raise exception 'FAIL: sell_a_box box'; end if;
  if not ((select count(*) from public.stock_movements where variant_id = pc and reason = 'sale' and delta = -50 and qty_after = 80) = 1) then
    raise exception 'FAIL: sell_a_box movement'; end if;

  -- sell_pieces: 31 loose -> 49 left, no whole box
  perform set_config('babajee.stock_reason', 'sale', true);
  update public.product_variants set stock_qty = stock_qty - 31 where id = pc;
  perform set_config('babajee.stock_reason', '', true);
  if not (select stock_qty = 0 from public.product_variants where id = bx) then raise exception 'FAIL: sell_pieces box'; end if;

  -- low_stock_lists_pieces_only
  if exists (select 1 from jsonb_array_elements(public.admin_low_stock()) x where (x ->> 'variant_id')::uuid = bx) then
    raise exception 'FAIL: low_stock_lists_pieces_only'; end if;

  -- correct_box_refused
  got := false;
  begin
    perform public.admin_correct_stock(bx, 3, 'count');
  exception when others then got := sqlerrm like 'A box holds no stock of its own%'; end;
  if not got then raise exception 'FAIL: correct_box_refused'; end if;

  -- void_box_bill: 100 pieces back out (49 - 100 = -51), the average from the
  -- loose bill alone, the box's cost after it
  perform public.admin_void_receipt(r_box);
  if not (select stock_qty = -51 from public.product_variants where id = pc) then raise exception 'FAIL: void_box_bill pieces'; end if;
  if not (select stock_qty = -2 from public.product_variants where id = bx) then raise exception 'FAIL: void_box_bill box'; end if;
  select * into c from public.variant_costs where variant_id = pc;
  if not (c.purchase = 12 and c.gst_paid = 2.16 and c.gst_claimable = 0) then
    raise exception 'FAIL: void_box_bill average (% % %)', c.purchase, c.gst_paid, c.gst_claimable; end if;
  if not ((select purchase from public.variant_costs where variant_id = bx) = 600 and (select gst_paid from public.variant_costs where variant_id = bx) = 108) then
    raise exception 'FAIL: void_box_bill box cost'; end if;

  -- count_pieces_moves_boxes: a correction on the pieces brings the box along
  perform public.admin_correct_stock(pc, 260, 'recount');
  if not (select stock_qty = 5 from public.product_variants where id = bx) then raise exception 'FAIL: count_pieces_moves_boxes'; end if;

  -- typed_cost_follows: a typed cost on the pieces gives the box x 50
  perform public.admin_set_purchase(pc, 8, 12, 'typed');
  select * into c from public.variant_costs where variant_id = bx;
  if not (c.purchase = 400 and c.gst_paid = 48 and c.cost = 448) then raise exception 'FAIL: typed_cost_follows (% % %)', c.purchase, c.gst_paid, c.cost; end if;

  -- second_box_size: a Box of 10 next to the Box of 50, both from the same pieces
  insert into public.product_variants (product_id, label, price, unit_variant_id, pack_of) values (prod, 'Box of 10', 100, pc, 10) returning id into other;
  if not (select stock_qty = 26 and track_stock from public.product_variants where id = other) then raise exception 'FAIL: second_box_size stock'; end if;
  if not ((select purchase from public.variant_costs where variant_id = other) = 80) then raise exception 'FAIL: second_box_size cost'; end if;
  perform set_config('babajee.stock_reason', 'sale', true);
  update public.product_variants set stock_qty = stock_qty - 2 where id = other;
  perform set_config('babajee.stock_reason', '', true);
  if not (select stock_qty = 240 from public.product_variants where id = pc) then raise exception 'FAIL: second_box_size pieces'; end if;
  if not (select stock_qty = 4 from public.product_variants where id = bx) then raise exception 'FAIL: second_box_size other box'; end if;

  -- correct_box_price_refused: a box's price follows its pieces
  got := false;
  begin
    perform public.admin_set_purchase(bx, 500, 18, 'box');
  exception when others then got := sqlerrm like 'A box''s buying price follows its pieces%'; end;
  if not got then raise exception 'FAIL: correct_box_price_refused'; end if;

  -- checkout_a_box: the shop's own checkout sells a box -> 50 pieces off, the
  -- box's cost (and its GST paid) kept on the order line
  update public.products set is_visible = true, status = 'published' where id = prod;
  update public.product_variants set is_visible = true where id in (pc, bx);
  select o.order_id into r_box from public.place_order(
    jsonb_build_array(jsonb_build_object('slug', 'zz-test-0058-p', 'variant', 'Box of 50', 'qty', 1)),
    jsonb_build_object('recipient_name', 'T', 'phone', '9999999999', 'line1', 'x', 'city', 'Pune', 'state', 'Maharashtra', 'pincode', '411001'), '') o;
  if not (select stock_qty = 190 from public.product_variants where id = pc) then raise exception 'FAIL: checkout_a_box pieces (%)', (select stock_qty from public.product_variants where id = pc); end if;
  select i.unit_price, ic.unit_cost, ic.unit_gst into l
    from public.order_items i join public.order_item_costs ic on ic.order_item_id = i.id where i.order_id = r_box;
  if not (l.unit_price = 450 and l.unit_cost = 448 and l.unit_gst = 48) then raise exception 'FAIL: checkout_a_box costs (% % %)', l.unit_price, l.unit_cost, l.unit_gst; end if;
  -- more boxes than there are: refused
  got := false;
  begin
    perform public.place_order(jsonb_build_array(jsonb_build_object('slug', 'zz-test-0058-p', 'variant', 'Box of 50', 'qty', 9)),
      jsonb_build_object('recipient_name', 'T', 'phone', '9999999999', 'line1', 'x', 'city', 'Pune', 'state', 'Maharashtra', 'pincode', '411001'), '');
  exception when others then got := sqlerrm like 'Only 3 left%'; end;
  if not got then raise exception 'FAIL: checkout_too_many_boxes'; end if;
end $$;
