-- A timed event always has a start; null end_time means unknown duration.
-- Known durations retain the existing same-date end-time constraint.
alter table public.events drop constraint event_time_order;
alter table public.events add constraint event_time_order check (
  all_day or (start_time is not null and (end_time is null or end_time > start_time))
);
