-- Order emails: "delivered" gets its own email too (with quick links to rate,
-- return, shop again or get help). Same trigger as 0052, one more status.

create or replace function public.order_events_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  if new.status not in ('paid', 'shipped', 'delivered', 'refund', 'return', 'cancelled') then
    return null;
  end if;
  select * into c from public.email_config where id = 1;
  if not found or not c.enabled or c.function_url = '' then
    return null;
  end if;
  begin
    perform net.http_post(
      url := c.function_url,
      body := jsonb_build_object('event_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || c.anon_key),
      timeout_milliseconds := 10000);
  exception when others then
    -- never let email break an order
    raise warning 'order email not queued: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.order_events_email() from public, anon, authenticated;
