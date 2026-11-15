-- Run with: bash scripts/test-sql.sh supabase/migrations/0052_order_emails.sql supabase/tests/0052_order_emails.test.sql
do $$
declare o uuid; e uuid; n int;
begin
  update public.email_config set enabled = true, function_url = 'https://example.invalid/functions/v1/order-email', anon_key = 'x' where id = 1;
  select id into o from public.orders where is_test limit 1;
  insert into public.order_events (order_id, status, note) values (o, 'shipped', '') returning id into e;
  select count(*) into n from net.http_request_queue where url = 'https://example.invalid/functions/v1/order-email';
  if n < 1 then raise exception 'FAIL email_call_queued'; end if;
  -- other events don't call
  insert into public.order_events (order_id, status, note) values (o, 'comment', 'x');
  select count(*) into n from net.http_request_queue where url = 'https://example.invalid/functions/v1/order-email';
  if n <> 1 then raise exception 'FAIL comment_not_emailed: %', n; end if;
  -- switched off: nothing queued
  update public.email_config set enabled = false where id = 1;
  insert into public.order_events (order_id, status, note) values (o, 'paid', '');
  select count(*) into n from net.http_request_queue where url = 'https://example.invalid/functions/v1/order-email';
  if n <> 1 then raise exception 'FAIL off_means_off'; end if;
  if not ('email_log' = any(public.export_table_list())) then raise exception 'FAIL export_list'; end if;
end $$;
