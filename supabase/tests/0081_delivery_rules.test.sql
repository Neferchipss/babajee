-- Tests for 0081 (delivery rules in settings). Rolled back. Empty response: passed.
do $$
declare
  got boolean;
begin
  if (select late_days from public.store_settings where id = 1) <> 7 then raise exception 'FAIL: late_default'; end if;
  if cardinality((select fail_reasons from public.store_settings where id = 1)) <> 5 then raise exception 'FAIL: reasons_default'; end if;
  got := false;
  begin
    update public.store_settings set late_days = 0 where id = 1;
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: late_range'; end if;
  got := false;
  begin
    update public.store_settings set fail_reasons = '{}' where id = 1;
  exception when check_violation then got := true; end;
  if not got then raise exception 'FAIL: reasons_not_empty'; end if;
  update public.store_settings set fail_reasons = array['Gate locked', 'Other'], late_days = 10 where id = 1;
  if (select late_days from public.store_settings where id = 1) <> 10 then raise exception 'FAIL: saves'; end if;
end $$;
select 'ok' where false;
