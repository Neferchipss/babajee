-- Tests for migration 0063 (sub-categories as tags). Run through
-- scripts/test-sql.sh: one transaction, rolled back. Empty response: passed.

do $$
declare
  adm uuid;
  c1 uuid; c2 uuid;
  p1 uuid; p2 uuid; p3 uuid;
  g_size uuid; g_perc uuid;
  s27 uuid; s14 uuid; s2p uuid; s_other uuid;
  got boolean;
  n int;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);

  insert into public.categories (slug, name) values ('zz-test-0060-bongs', 'Bongs 0060') returning id into c1;
  insert into public.categories (slug, name) values ('zz-test-0060-other', 'Other 0060') returning id into c2;
  insert into public.products (category_id, slug, name, subcategory) values (c1, 'zz-0060-bong-a', 'Bong A', 'Glass') returning id into p1;
  insert into public.products (category_id, slug, name, subcategory) values (c1, 'zz-0060-bong-b', 'Bong B', ' glass ') returning id into p2;
  insert into public.products (category_id, slug, name) values (c2, 'zz-0060-thing', 'Thing') returning id into p3;

  -- slug_of
  if public.slug_of('27 Inch Glass!') <> '27-inch-glass' then raise exception 'FAIL: slug_of'; end if;

  -- groups and tags; a product carries several
  insert into public.subcategory_groups (category_id, name) values (c1, 'Size') returning id into g_size;
  insert into public.subcategory_groups (category_id, name) values (c1, 'Percs') returning id into g_perc;
  insert into public.subcategories (category_id, group_id, slug, name) values (c1, g_size, '', '27 Inch') returning id into s27;
  if (select slug from public.subcategories where id = s27) <> '27-inch' then raise exception 'FAIL: slug_from_name'; end if;
  insert into public.subcategories (category_id, group_id, slug, name) values (c1, g_size, '14-inch', '14 Inch') returning id into s14;
  insert into public.subcategories (category_id, group_id, slug, name) values (c1, g_perc, '2-perc', '2 Perc') returning id into s2p;
  insert into public.product_subcategories values (p1, s27), (p1, s2p);
  if (select count(*) from public.product_subcategories where product_id = p1) <> 2 then raise exception 'FAIL: several_tags'; end if;

  -- other_category_refused: a tag of another category, or a group of another
  insert into public.subcategories (category_id, slug, name) values (c2, 'zz-misc', 'Misc') returning id into s_other;
  got := false;
  begin
    insert into public.product_subcategories values (p1, s_other);
  exception when others then got := sqlerrm like 'That sub-category belongs to another category%'; end;
  if not got then raise exception 'FAIL: other_category_tag_refused'; end if;
  got := false;
  begin
    insert into public.subcategories (category_id, group_id, slug, name) values (c2, g_size, 'zz-x', 'X');
  exception when others then got := sqlerrm like 'That group belongs to another category%'; end;
  if not got then raise exception 'FAIL: other_category_group_refused'; end if;

  -- addresses_dont_clash: a tag can't take a product's address, nor a product a tag's
  got := false;
  begin
    insert into public.subcategories (category_id, slug, name) values (c1, 'zz-0060-bong-a', 'Clash');
  exception when unique_violation then got := true; end;
  if not got then raise exception 'FAIL: tag_takes_product_address'; end if;
  got := false;
  begin
    insert into public.products (category_id, slug, name) values (c1, '2-perc', 'Clash');
  exception when unique_violation then got := true; end;
  if not got then raise exception 'FAIL: product_takes_tag_address'; end if;
  got := false;
  begin
    insert into public.subcategories (category_id, slug, name) values (c1, '27-inch-b', '27 inch');
  exception when unique_violation then got := true; end;
  if not got then raise exception 'FAIL: same_name_twice'; end if;

  -- moving_category_drops_tags
  update public.products set category_id = c2 where id = p1;
  if exists (select 1 from public.product_subcategories where product_id = p1) then raise exception 'FAIL: moving_category_drops_tags'; end if;
  update public.products set category_id = c1 where id = p1;

  -- hidden_tags_not_read_by_shoppers
  update public.subcategories set is_visible = false where id = s14;
  insert into public.product_subcategories values (p2, s14);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select count(*) into n from public.subcategories where category_id = c1;
  if n <> 2 then reset role; raise exception 'FAIL: hidden_tag_hidden (% seen)', n; end if;
  select count(*) into n from public.product_subcategories where product_id = p2;
  if n <> 0 then reset role; raise exception 'FAIL: hidden_tag_link_hidden'; end if;
  got := false;
  begin
    insert into public.subcategories (category_id, slug, name) values (c1, 'zz-anon', 'Anon');
  exception when insufficient_privilege then got := true; end;
  reset role;
  if not got then raise exception 'FAIL: shoppers_cant_add_tags'; end if;
end $$;

-- labels_come_across: the two products labelled "Glass" and " glass "
-- -> one tag named Glass, both tagged; running it again changes nothing
do $$
declare
  c uuid;
  sid uuid;
begin
  select id into c from public.categories where slug = 'zz-test-0060-bongs';
  perform public.subcategories_from_labels();
  perform public.subcategories_from_labels();
  select id into sid from public.subcategories where category_id = c and lower(name) = 'glass';
  if sid is null then raise exception 'FAIL: labels_come_across (no tag)'; end if;
  if (select slug from public.subcategories where id = sid) <> 'glass' then raise exception 'FAIL: labels_come_across slug'; end if;
  if (select count(*) from public.subcategories where category_id = c and lower(name) = 'glass') <> 1 then raise exception 'FAIL: labels_one_tag'; end if;
  if (select count(*) from public.product_subcategories where subcategory_id = sid) <> 2 then raise exception 'FAIL: labels_both_tagged'; end if;
end $$;
