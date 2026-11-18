-- Weekly task refreshes retain the same row, description and due date.
alter table public.tasks
  add column refresh_weekday smallint,
  add column refresh_time time without time zone,
  add column refresh_timezone text not null default 'Europe/Helsinki',
  add column next_refresh_at timestamptz,
  add constraint tasks_refresh_timezone_check check (refresh_timezone = 'Europe/Helsinki'),
  add constraint tasks_refresh_schedule_check check (
    (refresh_weekday is null and refresh_time is null and next_refresh_at is null)
    or (refresh_weekday is not null and refresh_weekday between 1 and 7
      and refresh_time is not null and refresh_time < time '24:00'
      and extract(second from refresh_time) = 0 and next_refresh_at is not null)
  );
create index tasks_next_refresh_idx on public.tasks(next_refresh_at) where next_refresh_at is not null;

create or replace function public.next_weekly_task_refresh(
  p_weekday integer, p_time time, p_timezone text, p_after timestamptz default now()
) returns timestamptz language plpgsql stable strict security invoker set search_path = '' as $$
declare local_now timestamp; target_date date; result timestamptz;
begin
  if p_weekday < 1 or p_weekday > 7 or p_time >= time '24:00'
    or extract(second from p_time) <> 0 or p_timezone <> 'Europe/Helsinki' then
    raise exception 'Choose a valid refresh day and time' using errcode = '22023';
  end if;
  local_now := p_after at time zone p_timezone;
  target_date := local_now::date + ((p_weekday - extract(isodow from local_now)::integer + 7) % 7);
  result := (target_date + p_time) at time zone p_timezone;
  if result <= p_after then result := (target_date + 7 + p_time) at time zone p_timezone; end if;
  return result;
end;
$$;
revoke all on function public.next_weekly_task_refresh(integer,time,text,timestamptz) from public, anon;
grant execute on function public.next_weekly_task_refresh(integer,time,text,timestamptz) to authenticated;

create or replace function public.set_task_refresh_schedule()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.refresh_weekday is null and new.refresh_time is null then
    new.next_refresh_at := null;
    return new;
  end if;
  if new.refresh_weekday is null or new.refresh_time is null then
    raise exception 'Choose both a refresh day and time' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    -- Undo across a refresh boundary restores the task in its new, open cycle.
    if new.next_refresh_at is not null and new.next_refresh_at <= now() then new.completed := false; end if;
    new.next_refresh_at := public.next_weekly_task_refresh(new.refresh_weekday, new.refresh_time, new.refresh_timezone);
  elsif new.refresh_weekday is distinct from old.refresh_weekday
    or new.refresh_time is distinct from old.refresh_time
    or new.refresh_timezone is distinct from old.refresh_timezone then
    new.next_refresh_at := public.next_weekly_task_refresh(new.refresh_weekday, new.refresh_time, new.refresh_timezone);
  elsif old.next_refresh_at <= now() and (not new.completed or not old.completed) then
    new.next_refresh_at := public.next_weekly_task_refresh(new.refresh_weekday, new.refresh_time, new.refresh_timezone);
  else
    -- The deadline is server-managed, including for direct REST updates.
    new.next_refresh_at := old.next_refresh_at;
  end if;
  return new;
end;
$$;
revoke all on function public.set_task_refresh_schedule() from public, anon, authenticated;
create trigger set_task_refresh_schedule before insert or update on public.tasks
for each row execute function public.set_task_refresh_schedule();

-- Catch up immediately when the owner opens the app, without bypassing RLS.
create or replace function public.refresh_weekly_tasks()
returns integer language plpgsql security invoker set search_path = '' as $$
declare affected integer;
begin
  if auth.uid() is null then raise exception 'Sign in to refresh tasks' using errcode = '42501'; end if;
  update public.tasks set completed = false, updated_at = now()
    where user_id = (select auth.uid()) and next_refresh_at <= now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.refresh_weekly_tasks() from public, anon;
grant execute on function public.refresh_weekly_tasks() to authenticated;

-- Only the database job can execute the cross-account worker. No SECURITY DEFINER API.
create schema if not exists daymark_private authorization postgres;
revoke all on schema daymark_private from public, anon, authenticated;
create or replace function daymark_private.refresh_weekly_tasks()
returns integer language plpgsql security invoker set search_path = '' as $$
declare affected integer;
begin
  update public.tasks set completed = false, updated_at = now() where next_refresh_at <= now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function daymark_private.refresh_weekly_tasks() from public, anon, authenticated;
grant execute on function daymark_private.refresh_weekly_tasks() to postgres;

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule('daymark-weekly-task-refresh', '* * * * *', 'select daymark_private.refresh_weekly_tasks();');
