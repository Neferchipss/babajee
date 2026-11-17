-- Tests for migration 0074 (support messages). Rolled back. Empty: passed.
do $$
declare
  own uuid; sf uuid;
  n int;
  got boolean;
begin
  select id into own from public.profiles where role = 'admin' order by created_at limit 1;
  select id into sf from public.profiles where role = 'customer' order by created_at limit 1;
  update public.profiles set role = 'admin', staff_role = 'storefront' where id = sf;

  -- a visitor sends one
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  perform public.submit_contact('Asha', 'Asha@Example.com', '98765 43210', 'order', 'BJ-1001', 'Where is my order?');
  -- and can't read any back
  got := false;
  begin
    select count(*) into n from public.support_messages;
  exception when insufficient_privilege then got := true; end;
  reset role;
  if not got then raise exception 'FAIL: visitors_cant_read'; end if;
  if (select email from public.support_messages where name = 'Asha') <> 'asha@example.com' then raise exception 'FAIL: saved'; end if;

  -- bad email refused; the sixth in an hour refused
  got := false;
  begin
    perform public.submit_contact('X', 'nope', '', 'other', '', 'hi there');
  exception when others then got := sqlerrm like 'That email%'; end;
  if not got then raise exception 'FAIL: bad_email'; end if;
  for n in 1..4 loop perform public.submit_contact('Asha', 'asha@example.com', '', 'other', '', 'again ' || n); end loop;
  got := false;
  begin
    perform public.submit_contact('Asha', 'asha@example.com', '', 'other', '', 'one more');
  exception when others then got := sqlerrm like 'You''ve sent%'; end;
  if not got then raise exception 'FAIL: rate_limit'; end if;

  -- the owner reads and closes; who and when are kept
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.support_messages where email = 'asha@example.com';
  update public.support_messages set status = 'replied' where email = 'asha@example.com' and topic = 'order';
  reset role;
  if n <> 5 then raise exception 'FAIL: owner_reads (%)', n; end if;
  if (select handled_by from public.support_messages where topic = 'order' and email = 'asha@example.com') <> own then raise exception 'FAIL: handled_by'; end if;

  -- a storefront manager can't read them
  perform set_config('request.jwt.claims', json_build_object('sub', sf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.support_messages;
  reset role;
  if n <> 0 then raise exception 'FAIL: storefront_cant_read'; end if;
end $$;
