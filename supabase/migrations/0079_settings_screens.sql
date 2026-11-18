-- 0079: settings that had no screen.
-- 1. store_settings.couriers: the shop's courier list, offered when an order
--    is shipped (typed names still work; this is the list to pick from).
-- 2. admin_set_hidden(profile, on): hide an account from tracking (0046) from
--    Settings > Team instead of the SQL editor. Owners and admins only (team).

alter table public.store_settings
  add column if not exists couriers text[] not null default array['Delhivery', 'DTDC', 'Blue Dart', 'India Post']::text[];
alter table public.store_settings drop constraint if exists store_settings_couriers_check;
alter table public.store_settings add constraint store_settings_couriers_check
  check (cardinality(couriers) <= 20 and array_position(couriers, '') is null);

create or replace function public.admin_set_hidden(p_profile uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.staff_can('team') then
    raise exception 'Only owners and admins can hide an account' using errcode = '42501';
  end if;
  update public.profiles set hidden = coalesce(p_hidden, false) where id = p_profile;
  if not found then
    raise exception 'No such account' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.admin_set_hidden(uuid, boolean) from public, anon;
grant execute on function public.admin_set_hidden(uuid, boolean) to authenticated;
