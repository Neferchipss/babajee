-- Tests for migration 0073 (storefront content). Rolled back. Empty: passed.
do $$
declare
  own uuid; fe uuid; sf uuid;
  ids uuid[];
  n int;
  b uuid;
  got boolean;
begin
  select id into own from public.profiles where role = 'admin' order by created_at limit 1;
  select array_agg(id) into ids from (select id from public.profiles where role = 'customer' order by created_at limit 2) x;
  fe := ids[1]; sf := ids[2];
  update public.profiles set role = 'admin', staff_role = 'frontend' where id = fe;
  update public.profiles set role = 'admin', staff_role = 'storefront' where id = sf;

  -- starting homepage sections
  if (select count(*) from public.home_sections) < 4 then raise exception 'FAIL: starting_sections'; end if;

  -- front-end staff: banners and the look yes, pages no
  perform set_config('request.jwt.claims', json_build_object('sub', fe, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.site_banners (title, image_url, link_url) values ('Diwali', '/banners/a.jpg', '/shop/') returning id into b;
  update public.site_look set design = 'haveli' where id = 1;
  got := false;
  begin
    insert into public.site_pages (slug, title) values ('about-us-zz', 'About');
  exception when insufficient_privilege then got := true; end;
  reset role;
  if not got then raise exception 'FAIL: frontend_cant_write_pages'; end if;
  if (select design from public.site_look) <> 'haveli' then raise exception 'FAIL: frontend_sets_look'; end if;

  -- storefront: a post, dated when published
  perform set_config('request.jwt.claims', json_build_object('sub', sf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.site_pages (kind, slug, title, body) values ('post', 'how-to-roll-zz', 'How to roll', 'Text');
  update public.site_pages set is_visible = true where slug = 'how-to-roll-zz';
  insert into public.faqs (question, answer) values ('Do you deliver?', 'Across India.');
  reset role;
  if (select published_at from public.site_pages where slug = 'how-to-roll-zz') is null then raise exception 'FAIL: published_date'; end if;
  if (select author_id from public.site_pages where slug = 'how-to-roll-zz') <> sf then raise exception 'FAIL: author'; end if;

  -- shoppers: only what's live
  update public.site_banners set ends_at = now() - interval '1 hour', starts_at = now() - interval '2 hours' where id = b;
  insert into public.site_pages (slug, title) values ('draft-zz', 'Draft');
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  select count(*) into n from public.site_banners where id = b;
  if n <> 0 then reset role; raise exception 'FAIL: ended_banner_hidden'; end if;
  select count(*) into n from public.site_pages where slug in ('draft-zz', 'how-to-roll-zz');
  if n <> 1 then reset role; raise exception 'FAIL: drafts_hidden (%)', n; end if;
  got := false;
  begin
    update public.site_look set design = 'current';
    get diagnostics n = row_count;
    got := n = 0;
  exception when insufficient_privilege then got := true; end;
  reset role;
  if not got then raise exception 'FAIL: shoppers_cant_change_look'; end if;

  -- bad links refused
  got := false;
  begin
    insert into public.site_banners (title, link_url) values ('x', 'javascript:alert(1)');
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: bad_link_refused'; end if;
end $$;

do $$
declare n int;
begin
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  select count(*) into n from public.shop_best_sellers(60, 12);
  reset role;
  if n > 12 then raise exception 'FAIL: best_sellers_limit'; end if;
end $$;
