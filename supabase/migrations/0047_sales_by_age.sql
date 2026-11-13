-- Analytics: who buys, by age (from the date of birth asked at sign-up, 0045).
--
-- admin_sales_by_age(p_from, p_to) returns
--   { "bands": [{ band, sort, buyers, orders, sales }],   orders placed in the dates
--     "accounts": [{ band, sort, n }] }                   every customer account, all time
-- Bands are the buyer's age today: 18–24, 25–34, 35–44, 45–54, 55+, and
-- "Age not given" (guests, and accounts made before 0045 or by hand).
-- Sales are order totals, leaving out cancelled and refunded orders.
-- Hidden accounts (0046) are left out of both.
--
-- Check (read-only) afterwards:
--   select proname from pg_proc where proname = 'admin_sales_by_age';  -- 1 row

create or replace function public.age_band(dob date)
returns table (band text, sort int)
language sql
stable
set search_path = ''
as $$
  select case
           when dob is null then 'Age not given'
           when a < 25 then '18–24'
           when a < 35 then '25–34'
           when a < 45 then '35–44'
           when a < 55 then '45–54'
           else '55+'
         end,
         case
           when dob is null then 9
           when a < 25 then 1
           when a < 35 then 2
           when a < 45 then 3
           when a < 55 then 4
           else 5
         end
    from (select extract(year from age(current_date, dob))::int as a) x;
$$;

create or replace function public.admin_sales_by_age(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t0 timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  t1 timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
  bands jsonb;
  accounts jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x order by x.sort), '[]') into bands from (
    select b.band, b.sort,
           count(distinct coalesce(o.profile_id::text, lower(o.contact_email))) as buyers,
           count(*) as orders,
           sum(o.total) as sales
      from public.orders o
      left join public.profiles p on p.id = o.profile_id
      cross join lateral public.age_band(p.date_of_birth) b
     where o.created_at >= t0 and o.created_at < t1
       and o.status not in ('cancelled', 'refunded')
       and not coalesce(p.hidden, false)
     group by b.band, b.sort
  ) x;

  select coalesce(jsonb_agg(y order by y.sort), '[]') into accounts from (
    select b.band, b.sort, count(*) as n
      from public.profiles p
      cross join lateral public.age_band(p.date_of_birth) b
     where p.role = 'customer' and not p.hidden
     group by b.band, b.sort
  ) y;

  return jsonb_build_object('bands', bands, 'accounts', accounts);
end;
$$;

revoke all on function public.admin_sales_by_age(date, date) from public, anon;
grant execute on function public.admin_sales_by_age(date, date) to authenticated;
revoke all on function public.age_band(date) from public, anon;
grant execute on function public.age_band(date) to authenticated;
