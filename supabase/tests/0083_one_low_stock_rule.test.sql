-- Tests for 0083 (one low-stock rule). Rolled back. Empty response: passed.
do $$
declare
  adm uuid; cat uuid; p uuid; d uuid;
  before_out int; after_out int; listed int;
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  before_out := (public.admin_home_counts() ->> 'out_of_stock')::int;
  insert into public.categories (slug, name) values ('zz-0083', 'T') returning id into cat;
  -- an out-of-stock option on a draft: not counted anywhere
  insert into public.products (category_id, slug, name, status) values (cat, 'zz-0083-d', 'Draft', 'draft') returning id into d;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (d, 'Default', 10, 0, true);
  after_out := (public.admin_home_counts() ->> 'out_of_stock')::int;
  if after_out <> before_out then raise exception 'FAIL: draft_not_counted (% -> %)', before_out, after_out; end if;
  -- the same on an active product: counted, and in the alert's list too
  insert into public.products (category_id, slug, name, status) values (cat, 'zz-0083-a', 'Active', 'published') returning id into p;
  insert into public.product_variants (product_id, label, price, stock_qty, track_stock) values (p, 'Default', 10, 0, true);
  after_out := (public.admin_home_counts() ->> 'out_of_stock')::int;
  if after_out <> before_out + 1 then raise exception 'FAIL: active_counted (% -> %)', before_out, after_out; end if;
  select count(*) into listed from jsonb_array_elements(public.admin_low_stock()) e where e ->> 'product_id' = p::text;
  if listed <> 1 then raise exception 'FAIL: alert_lists_it'; end if;
end $$;
select 'ok' where false;
