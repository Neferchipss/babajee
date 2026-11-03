-- The admin's Customers page lists the shop's admins too (shown in red there),
-- so admin_customers() now returns everyone with an account and their role.
-- Depends on 0013. Safe to re-run.

drop function if exists public.admin_customers();

create or replace function public.admin_customers()
returns table (id uuid, full_name text, phone text, email text, role text, joined timestamptz,
               orders bigint, spent numeric, last_order timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.phone, u.email::text, p.role, p.created_at,
           count(o.id), coalesce(sum(o.total) filter (where o.status not in ('cancelled', 'refunded')), 0),
           max(o.created_at)
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.orders o on o.profile_id = p.id
     group by p.id, u.email
     order by max(o.created_at) desc nulls last, p.created_at desc;
end;
$$;

revoke all on function public.admin_customers() from public, anon;
grant execute on function public.admin_customers() to authenticated;
