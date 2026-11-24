-- Tests for 0087 (site_look.colours, the shop's saved palette). Rolled back. Empty response: passed.
do $$
declare
  adm uuid; got boolean; n int;
  full_light jsonb := '{"page":"#fbf4e6","panels":"#fffaf0","lines":"#e8d6b5","text":"#2b1a12","secondary":"#6f5444","backdrop":"#f3ebdc","accent":"#c3141a","onAccent":"#fffaf0","hot":"#c3141a","green":"#167a43","bar":"#fbf4e6"}';
  full_dark jsonb := '{"page":"#1d0f10","panels":"#2a1416","lines":"#4a2a2b","text":"#fbf4e6","secondary":"#c9b49c","backdrop":"#efe6d6","accent":"#f04a4f","onAccent":"#1d0f10","hot":"#f04a4f","green":"#3fbf73","bar":"#1d0f10"}';
begin
  select id into adm from public.profiles where role = 'admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- a full palette, both modes, every slot
  update public.site_look set colours = jsonb_build_object('preset', 'haveli', 'light', full_light, 'dark', full_dark) where id = 1;
  if (select colours->>'preset' from public.site_look where id = 1) is distinct from 'haveli' then raise exception 'FAIL: colours_full_ok'; end if;

  -- a partial palette (the rest falls back to Legacy in the shop)
  update public.site_look set colours = '{"preset":"custom","light":{"accent":"#c3141a"},"dark":{}}' where id = 1;
  if (select colours->'light'->>'accent' from public.site_look where id = 1) is distinct from '#c3141a' then raise exception 'FAIL: colours_partial_ok'; end if;

  -- back to Legacy
  update public.site_look set colours = null where id = 1;
  if (select colours from public.site_look where id = 1) is not null then raise exception 'FAIL: colours_null_ok'; end if;

  -- a colour must be lowercase #rrggbb
  got := false;
  begin
    update public.site_look set colours = '{"preset":"custom","light":{"accent":"#C3141A"},"dark":{}}' where id = 1;
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: bad_hex_refused (uppercase)'; end if;
  got := false;
  begin
    update public.site_look set colours = '{"preset":"custom","light":{"accent":"red"},"dark":{}}' where id = 1;
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: bad_hex_refused (name)'; end if;

  -- only the known parts of the shop
  got := false;
  begin
    update public.site_look set colours = '{"preset":"custom","light":{"header":"#000000"},"dark":{}}' where id = 1;
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: bad_slot_refused'; end if;

  -- only the known presets
  got := false;
  begin
    update public.site_look set colours = '{"preset":"shopfront","light":{},"dark":{}}' where id = 1;
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: bad_preset_refused'; end if;

  -- a visitor can't change it
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  got := false;
  begin
    update public.site_look set colours = '{"preset":"custom","light":{},"dark":{}}' where id = 1;
    get diagnostics n = row_count;
    got := n = 0;
  exception when insufficient_privilege then got := true; end;
  if not got then raise exception 'FAIL: anon_cannot_write'; end if;
  reset role;
end $$;
select 'ok' where false;
