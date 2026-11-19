-- 0082: the front-end role (staff_can('look')) arranges the homepage, so its
-- pickers need every collection and category, hidden ones included (a section
-- can be set up before its shelf goes live). Read only; writing stays with
-- catalogue staff and admins.
drop policy if exists "look staff read collections" on public.collections;
create policy "look staff read collections" on public.collections
  for select to authenticated using (public.staff_can('look'));
drop policy if exists "look staff read collection items" on public.collection_items;
create policy "look staff read collection items" on public.collection_items
  for select to authenticated using (public.staff_can('look'));
drop policy if exists "look staff read categories" on public.categories;
create policy "look staff read categories" on public.categories
  for select to authenticated using (public.staff_can('look'));
