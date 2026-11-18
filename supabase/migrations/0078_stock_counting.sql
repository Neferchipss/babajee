-- Stock counting on or off for one option (Inventory > Stock). Until now it
-- could only be switched on (a count, or "track everything", 0050/0061).
-- admin_set_counting(variant, on):
--   on:  starts counting from the option's current number (0 if none),
--        as a counted correction would
--   off: stops counting; the number is kept, checkout no longer limits sales
-- A box or a bundle follows the option(s) it's made of, so it can't be set on
-- its own. Allowed for everyone who works on products (staff_can('catalog')).
-- The change goes in stock history with its reason. Re-run safe. Depends on
-- 0061, 0071, 0072.

create or replace function public.admin_set_counting(p_variant uuid, p_on boolean, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  if not public.staff_can('catalog') then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  select pv.id, pv.unit_variant_id, pv.track_stock, pv.stock_qty into v from public.product_variants pv where pv.id = p_variant for update;
  if v.id is null then
    raise exception 'Option not found.' using errcode = 'P0002';
  end if;
  if v.unit_variant_id is not null then
    raise exception 'A box follows its loose pieces: change counting on the loose option.' using errcode = '22023';
  end if;
  if exists (select 1 from public.bundle_items where bundle_variant_id = p_variant) then
    raise exception 'A bundle follows its parts: change counting on them.' using errcode = '22023';
  end if;
  if v.track_stock = p_on then
    return;
  end if;
  perform set_config('babajee.stock_reason', 'manual', true);
  perform set_config('babajee.stock_note', left(coalesce(nullif(btrim(p_note), ''), case when p_on then 'Started counting stock' else 'Stopped counting stock' end), 300), true);
  update public.product_variants set track_stock = p_on, stock_qty = greatest(coalesce(stock_qty, 0), 0) where id = p_variant;
  -- a line in the history even though the number didn't move
  insert into public.stock_movements (variant_id, delta, qty_after, reason, note, actor_id, created_at)
  values (p_variant, 0, (select stock_qty from public.product_variants where id = p_variant), 'manual',
          case when p_on then 'Started counting stock' else 'Stopped counting stock' end || coalesce(nullif(' · ' || btrim(p_note), ' · '), ''),
          (select auth.uid()), clock_timestamp());
  perform set_config('babajee.stock_note', '', true);
end;
$$;
revoke all on function public.admin_set_counting(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_counting(uuid, boolean, text) to authenticated;
