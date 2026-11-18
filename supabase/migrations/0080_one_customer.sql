-- 0080: one customer's summary row, for the customer page (it used to load
-- every customer to show one). Same columns and rules as admin_customers()
-- (0046), for one id.
create or replace function public.admin_customer(p_id uuid)
returns table (id uuid, full_name text, phone text, email text, role text, joined timestamptz,
               orders bigint, spent numeric, last_order timestamptz, is_test boolean,
               tags text[], city text, state text, date_of_birth date)
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
    select p.id, p.full_name, p.phone, coalesce(u.email, '')::text, p.role, p.created_at,
           count(o.id), coalesce(sum(o.total) filter (where o.status not in ('cancelled', 'refunded')), 0),
           max(o.created_at), p.is_test, p.tags,
           coalesce(a.city, lo.address_city, ''), coalesce(a.state, lo.address_state, ''),
           p.date_of_birth
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.orders o on o.profile_id = p.id
      left join lateral (
        select ad.city, ad.state from public.addresses ad
         where ad.profile_id = p.id order by ad.is_default desc, ad.created_at desc limit 1) a on true
      left join lateral (
        select x.address_city, x.address_state from public.orders x
         where x.profile_id = p.id order by x.created_at desc limit 1) lo on true
     where p.id = p_id and not p.hidden
     group by p.id, u.email, a.city, a.state, lo.address_city, lo.address_state;
end;
$$;
revoke all on function public.admin_customer(uuid) from public, anon;
grant execute on function public.admin_customer(uuid) to authenticated;
