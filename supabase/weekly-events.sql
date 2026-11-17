-- Upgrade an existing Daymark project. Ownership/RLS policies remain unchanged.
alter table public.events
  add column recurrence text not null default 'none'
    constraint events_recurrence_check check (recurrence in ('none', 'weekly')),
  add column repeat_until date,
  add constraint events_repeat_until_check check (
    repeat_until is null or (recurrence = 'weekly' and repeat_until >= event_date)
  );
