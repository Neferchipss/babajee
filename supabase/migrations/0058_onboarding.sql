-- Onboarding by email code (0058). A new customer's account is made the moment
-- they enter the code sent to their email, before they've given their name,
-- phone or date of birth; the next screen sends those here.
-- complete_profile(name, phone, date of birth): the signed-in customer's own
-- profile only. Name and phone are saved; the date of birth is set once, only
-- while it's still empty (customers can't change it later, 0045), and the
-- 18+ rule in check_date_of_birth() applies. Setting it records the age check.

create or replace function public.complete_profile(p_name text, p_phone text, p_dob date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  nm text := left(trim(coalesce(p_name, '')), 120);
  ph text := left(trim(coalesce(p_phone, '')), 32);
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;
  if length(nm) < 2 then
    raise exception 'Enter your name.';
  end if;
  if length(regexp_replace(ph, '\D', '', 'g')) < 10 then
    raise exception 'Enter a 10-digit mobile number.';
  end if;
  update public.profiles
     set full_name = nm,
         phone = ph,
         date_of_birth = coalesce(date_of_birth, p_dob),
         age_verified_at = case when date_of_birth is null and p_dob is not null then now() else age_verified_at end
   where id = me;
end;
$$;
revoke all on function public.complete_profile(text, text, date) from public, anon;
grant execute on function public.complete_profile(text, text, date) to authenticated;
