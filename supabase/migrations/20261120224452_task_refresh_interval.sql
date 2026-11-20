-- Allow interval schedules beside existing weekday schedules without changing their deadlines.
alter table public.tasks
  add column refresh_interval_days integer,
  drop constraint tasks_refresh_schedule_check,
  add constraint tasks_refresh_schedule_check check (
    (refresh_weekday is null and refresh_interval_days is null and refresh_time is null and next_refresh_at is null)
    or (refresh_time is not null and refresh_time < time '24:00'
      and extract(second from refresh_time) = 0 and next_refresh_at is not null
      and (
        (refresh_weekday is not null and refresh_interval_days is null and refresh_weekday between 1 and 7)
        or (refresh_weekday is null and refresh_interval_days is not null and refresh_interval_days between 1 and 365000)
      ))
  );

create or replace function public.next_interval_task_refresh(
  p_days integer, p_time time, p_after timestamptz, p_previous timestamptz
) returns timestamptz language plpgsql stable security invoker set search_path = '' as $$
declare
  today date := (p_after at time zone 'Europe/Helsinki')::date;
  target_date date;
  result timestamptz;
begin
  if p_days is null or p_days not between 1 and 365000 or p_time is null
    or p_time >= time '24:00' or extract(second from p_time) <> 0
    or p_after is null or not isfinite(p_after) or (p_previous is not null and not isfinite(p_previous)) then
    raise exception 'Choose a positive whole number of days and a valid refresh time' using errcode = '22023';
  end if;
  if p_previous is null then
    target_date := today + p_days;
  else
    target_date := (p_previous at time zone 'Europe/Helsinki')::date;
    -- Advance on the original calendar-day cadence, even if several cycles were missed.
    target_date := target_date + (greatest(0, today - target_date) / p_days) * p_days;
  end if;
  result := (target_date + p_time) at time zone 'Europe/Helsinki';
  if result <= p_after then result := (target_date + p_days + p_time) at time zone 'Europe/Helsinki'; end if;
  return result;
end;
$$;
revoke all on function public.next_interval_task_refresh(integer,time,timestamptz,timestamptz) from public, anon;
grant execute on function public.next_interval_task_refresh(integer,time,timestamptz,timestamptz) to authenticated;

create or replace function public.set_task_refresh_schedule()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare previous_deadline timestamptz;
begin
  if tg_op = 'UPDATE' and old.refresh_interval_days is not null
    and new.refresh_interval_days is not distinct from old.refresh_interval_days then
    -- A cached client can edit other task fields or explicitly choose a legacy weekday.
    if new.refresh_weekday is not null then new.refresh_interval_days := null;
    elsif new.refresh_time is null then new.refresh_time := old.refresh_time;
    end if;
  end if;
  if new.refresh_weekday is null and new.refresh_interval_days is null and new.refresh_time is null then
    new.next_refresh_at := null;
    return new;
  end if;
  if new.refresh_time is null or (new.refresh_weekday is null) = (new.refresh_interval_days is null) then
    raise exception 'Choose a refresh schedule and time' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    -- Undo keeps an upcoming deadline or restores the task open if its deadline passed.
    previous_deadline := new.next_refresh_at;
    if previous_deadline <= now() then new.completed := false; end if;
  elsif new.refresh_interval_days is distinct from old.refresh_interval_days
    or new.refresh_weekday is distinct from old.refresh_weekday
    or new.refresh_time is distinct from old.refresh_time
    or new.refresh_timezone is distinct from old.refresh_timezone then
    previous_deadline := null;
  elsif old.next_refresh_at <= now() and (not new.completed or not old.completed) then
    previous_deadline := old.next_refresh_at;
  else
    new.next_refresh_at := old.next_refresh_at;
    return new;
  end if;

  if new.refresh_interval_days is not null then
    new.next_refresh_at := public.next_interval_task_refresh(new.refresh_interval_days, new.refresh_time, now(), previous_deadline);
  else
    new.next_refresh_at := public.next_weekly_task_refresh(new.refresh_weekday, new.refresh_time, new.refresh_timezone);
  end if;
  return new;
end;
$$;
revoke all on function public.set_task_refresh_schedule() from public, anon, authenticated;
