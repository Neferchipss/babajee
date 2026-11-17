-- Support: the Contact page's form now reaches the shop. Each message is a
-- row in support_messages (name, email, phone, topic, order number, the
-- message), read and answered from Admin > Customers > Messages. Nothing is
-- emailed or sent by the site (notifications stay off): the shop replies
-- itself by email or WhatsApp and marks the message done.
--
-- 1. support_messages, readable and changeable by staff with money access
--    (owner, admin, store account); nobody else can read them.
-- 2. submit_contact(...): anyone, signed in or not, can send one. Basic
--    limits: sensible lengths, a real-looking email, at most 5 from one
--    email or account in an hour.
-- 3. admin_support_counts(): open messages, for the menu.
--
-- Re-run safe. Depends on 0072.

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  name text not null check (length(name) between 1 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  phone text not null default '' check (length(phone) <= 20),
  topic text not null default 'other' check (topic in ('order', 'product', 'delivery', 'return', 'wholesale', 'other')),
  order_number text not null default '' check (length(order_number) <= 40),
  message text not null check (length(message) between 2 and 4000),
  status text not null default 'open' check (status in ('open', 'replied', 'closed')),
  note text not null default '' check (length(note) <= 2000),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists support_messages_status_idx on public.support_messages (status, created_at desc);

alter table public.support_messages enable row level security;
drop policy if exists "money staff read messages" on public.support_messages;
create policy "money staff read messages" on public.support_messages for select to authenticated using (public.staff_can('money'));
drop policy if exists "money staff update messages" on public.support_messages;
create policy "money staff update messages" on public.support_messages for update to authenticated using (public.staff_can('money')) with check (public.staff_can('money'));
drop policy if exists "owners delete messages" on public.support_messages;
create policy "owners delete messages" on public.support_messages for delete to authenticated using (public.staff_can('delete'));
revoke all on public.support_messages from anon, authenticated;
grant select, update, delete on public.support_messages to authenticated;

-- who handled it, when
create or replace function public.support_messages_handled()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.handled_by := (select auth.uid());
    new.handled_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists support_messages_handled on public.support_messages;
create trigger support_messages_handled before update on public.support_messages
  for each row execute function public.support_messages_handled();

create or replace function public.submit_contact(p_name text, p_email text, p_phone text, p_topic text, p_order text, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  em text := lower(btrim(coalesce(p_email, '')));
begin
  if btrim(coalesce(p_name, '')) = '' or btrim(coalesce(p_message, '')) = '' then
    raise exception 'Add your name and a message.' using errcode = '22023';
  end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email doesn''t look right.' using errcode = '22023';
  end if;
  if (select count(*) from public.support_messages
       where created_at > now() - interval '1 hour' and (email = em or (me is not null and profile_id = me))) >= 5 then
    raise exception 'You''ve sent a few messages already. We''ll get back to you soon.' using errcode = '54000';
  end if;
  insert into public.support_messages (profile_id, name, email, phone, topic, order_number, message)
  values (me, left(btrim(p_name), 120), em, left(regexp_replace(coalesce(p_phone, ''), '[^0-9+ ]', '', 'g'), 20),
          case when p_topic in ('order', 'product', 'delivery', 'return', 'wholesale', 'other') then p_topic else 'other' end,
          left(btrim(coalesce(p_order, '')), 40), left(btrim(p_message), 4000));
end;
$$;
revoke all on function public.submit_contact(text, text, text, text, text, text) from public;
grant execute on function public.submit_contact(text, text, text, text, text, text) to anon, authenticated;
