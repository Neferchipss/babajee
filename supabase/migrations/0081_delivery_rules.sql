-- 0081: two delivery rules that lived in code, now in Settings › Delivery.
-- fail_reasons: the choices when recording a failed delivery (the order's
--   own reason is kept as text, so changing the list never changes history).
-- late_days: a shipped order not delivered after this many days counts as
--   late in Reports (deliveries, late list).
alter table public.store_settings
  add column if not exists fail_reasons text[] not null
    default array['Customer not home', 'Wrong or incomplete address', 'Phone unreachable', 'Refused the parcel', 'Other']::text[],
  add column if not exists late_days int not null default 7;
alter table public.store_settings drop constraint if exists store_settings_fail_reasons_check;
alter table public.store_settings add constraint store_settings_fail_reasons_check
  check (cardinality(fail_reasons) between 1 and 12 and array_position(fail_reasons, '') is null);
alter table public.store_settings drop constraint if exists store_settings_late_days_check;
alter table public.store_settings add constraint store_settings_late_days_check check (late_days between 1 and 60);
