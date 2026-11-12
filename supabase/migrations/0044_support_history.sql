-- Support history: staff notes on a customer become a support log.
--
-- customer_notes gains:
--   kind:     'note' (a private note, as before) or 'contact' (a call,
--             WhatsApp, email or visit with the customer)
--   channel:  how they were in touch, for a contact
--   order_id: the order it was about, if any
--   status:   'open' while it needs a follow-up, 'resolved' when done,
--             null for a plain note; resolved_at when it was closed
-- Existing notes stay notes. Open items are counted on the admin's Home.
-- Depends on 0002 (customer_notes). Safe to re-run.

alter table public.customer_notes add column if not exists kind text not null default 'note';
alter table public.customer_notes add column if not exists channel text not null default '';
alter table public.customer_notes add column if not exists order_id uuid references public.orders (id) on delete set null;
alter table public.customer_notes add column if not exists status text;
alter table public.customer_notes add column if not exists resolved_at timestamptz;

alter table public.customer_notes drop constraint if exists customer_notes_kind_check;
alter table public.customer_notes add constraint customer_notes_kind_check check (kind in ('note', 'contact'));
alter table public.customer_notes drop constraint if exists customer_notes_channel_check;
alter table public.customer_notes add constraint customer_notes_channel_check check (channel in ('', 'whatsapp', 'call', 'email', 'in_person', 'instagram', 'other'));
alter table public.customer_notes drop constraint if exists customer_notes_status_check;
alter table public.customer_notes add constraint customer_notes_status_check check (status is null or status in ('open', 'resolved'));

create index if not exists customer_notes_open on public.customer_notes (status) where status = 'open';

-- admins already read and change notes under 0002's rule ("admins manage
-- customer notes"); nothing new to grant.
