-- 0087: the shop's colours, set part by part in Admin > Storefront > Colours
-- in place of the storefront designs. One palette for the whole shop, with a
-- light and a dark version (visitors keep their light/dark switch):
--   { "preset": "legacy" | "rasta" | "haveli" | "chai" | "courtyard" | "custom",
--     "light": { <part>: "#rrggbb", ... }, "dark": { ... } }
-- The parts are page, panels, lines, text, secondary, backdrop, accent,
-- onAccent, hot, green and bar. A part left out takes the Legacy colour, and
-- null (the default) is Legacy itself: today's colours, so nothing changes
-- until someone saves. site_look.design stays but is no longer read.
-- Writes go through 0073's "look staff change the look" policy.

create or replace function public.shop_colours_ok(c jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(c) = 'object'
    and (c ->> 'preset') in ('legacy', 'rasta', 'haveli', 'chai', 'courtyard', 'custom')
    and (select coalesce(bool_and(k in ('preset', 'light', 'dark')), true) from jsonb_object_keys(c) k)
    and coalesce(jsonb_typeof(c -> 'light'), 'object') = 'object'
    and coalesce(jsonb_typeof(c -> 'dark'), 'object') = 'object'
    and (
      select coalesce(bool_and(
        e.key in ('page', 'panels', 'lines', 'text', 'secondary', 'backdrop', 'accent', 'onAccent', 'hot', 'green', 'bar')
        and jsonb_typeof(e.value) = 'string'
        and (e.value #>> '{}') ~ '^#[0-9a-f]{6}$'
      ), true)
      from (
        select * from jsonb_each(coalesce(c -> 'light', '{}'::jsonb))
        union all
        select * from jsonb_each(coalesce(c -> 'dark', '{}'::jsonb))
      ) e
    );
$$;

alter table public.site_look add column if not exists colours jsonb;
alter table public.site_look drop constraint if exists site_look_colours_ok;
alter table public.site_look add constraint site_look_colours_ok
  check (colours is null or public.shop_colours_ok(colours));
