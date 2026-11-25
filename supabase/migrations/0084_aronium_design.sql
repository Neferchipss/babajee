-- 0084: the admin designs become two, Legacy (stored as 'current', the admin
-- as it was) and Aronium-style. Shopify-style, Ease and Studio were removed,
-- so anyone who had picked one goes back to Legacy, and profiles.admin_design
-- (0077) only takes the two that remain.
update public.profiles set admin_design = 'current'
  where admin_design in ('shopify', 'ease', 'studio');
alter table public.profiles drop constraint if exists profiles_admin_design_check;
alter table public.profiles add constraint profiles_admin_design_check
  check (admin_design is null or admin_design in ('current', 'aronium'));
