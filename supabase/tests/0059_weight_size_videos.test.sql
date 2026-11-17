-- Tests for migration 0059 (weight, size, videos). Run through
-- scripts/test-sql.sh: one transaction, rolled back. Empty response: passed.

do $$
declare
  cat uuid;
  prod uuid;
  v uuid;
  got boolean;
begin
  insert into public.categories (slug, name) values ('zz-test-0059', 'Test 0059') returning id into cat;
  insert into public.products (category_id, slug, name) values (cat, 'zz-test-0059-p', 'Test 0059') returning id into prod;
  insert into public.product_variants (product_id, label, price) values (prod, 'One', 10) returning id into v;

  -- size_saved
  update public.product_variants set weight_g = 12.5, length_cm = 11, width_cm = 4.5, height_cm = 0.5 where id = v;
  if not (select weight_g = 12.5 and height_cm = 0.5 from public.product_variants where id = v) then raise exception 'FAIL: size_saved'; end if;

  -- size_not_zero
  got := false;
  begin
    update public.product_variants set weight_g = 0 where id = v;
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: size_not_zero'; end if;

  -- videos_https_only
  update public.products set video_urls = array['https://www.youtube.com/watch?v=abc', 'https://cdn.example.com/a.mp4'] where id = prod;
  got := false;
  begin
    update public.products set video_urls = array['javascript:alert(1)'] where id = prod;
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: videos_https_only'; end if;
  got := false;
  begin
    update public.products set video_urls = array['https://a.com/x', 'https://a.com/y', 'https://a.com/z', 'https://a.com/1', 'https://a.com/2', 'https://a.com/3', 'https://a.com/4'] where id = prod;
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: videos_at_most_six'; end if;
  update public.products set video_urls = '{}' where id = prod;
end $$;
