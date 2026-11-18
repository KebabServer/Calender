-- Daymark database schema: run once in your Supabase SQL Editor.
-- Every table is private by default and scoped to auth.uid() using RLS.
create extension if not exists pgcrypto;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  content text not null default '',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  event_date date not null,
  start_time time,
  end_time time,
  all_day boolean not null default false,
  color text not null default 'purple' check (color in ('purple', 'mint', 'peach', 'blue')),
  recurrence text not null default 'none' constraint events_recurrence_check check (recurrence in ('none', 'weekly')),
  repeat_until date,
  constraint events_repeat_until_check check (repeat_until is null or (recurrence = 'weekly' and repeat_until >= event_date)),
  note_id uuid references public.notes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_time_order check (all_day or (start_time is not null and (end_time is null or end_time > start_time)))
);

create index if not exists notes_user_updated_idx on public.notes(user_id, updated_at desc);
create index if not exists events_user_date_idx on public.events(user_id, event_date);

alter table public.notes enable row level security;
alter table public.events enable row level security;

create policy "Users can read own notes" on public.notes for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own notes" on public.notes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own notes" on public.notes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own notes" on public.notes for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users can read own events" on public.events for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own events" on public.events for insert to authenticated with check ((select auth.uid()) = user_id and (note_id is null or exists (select 1 from public.notes n where n.id = note_id and n.user_id = (select auth.uid()))));
create policy "Users can update own events" on public.events for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and (note_id is null or exists (select 1 from public.notes n where n.id = note_id and n.user_id = (select auth.uid()))));
create policy "Users can delete own events" on public.events for delete to authenticated using ((select auth.uid()) = user_id);

-- Enable Postgres Changes for live multi-device updates.
-- This can also be done in Supabase Dashboard > Database > Publications.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notes') then
    alter publication supabase_realtime add table public.notes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events') then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;

-- Expose only authenticated CRUD; row policies enforce ownership.
revoke all on public.notes, public.events from anon, authenticated;
grant select, insert, update, delete on public.notes, public.events to authenticated;
create index if not exists events_note_id_idx on public.events(note_id);

-- Atomic source save + 1–10 independent weekly copies. Existing RLS applies.
create or replace function public.save_event_with_copies(
  p_event_id uuid, p_input jsonb, p_copy_count integer
) returns setof public.events
language plpgsql security invoker set search_path = ''
as $$
declare
  source public.events;
  copied public.events;
  input public.events;
  week integer;
begin
  if auth.uid() is null then raise exception 'Sign in to save events' using errcode = '42501'; end if;
  if p_copy_count is null or p_copy_count < 1 or p_copy_count > 10 then
    raise exception 'Choose between 1 and 10 copies' using errcode = '22023';
  end if;
  input := pg_catalog.jsonb_populate_record(null::public.events, p_input);
  if p_event_id is null then
    insert into public.events(user_id,title,description,event_date,start_time,end_time,all_day,color,note_id,recurrence,repeat_until)
    values(auth.uid(),input.title,coalesce(input.description,''),input.event_date,input.start_time,input.end_time,input.all_day,input.color,input.note_id,'none',null)
    returning * into source;
  else
    update public.events set title=input.title, description=coalesce(input.description,''), event_date=input.event_date,
      start_time=input.start_time, end_time=input.end_time, all_day=input.all_day, color=input.color,
      note_id=input.note_id, recurrence='none', repeat_until=null, updated_at=pg_catalog.now()
    where id=p_event_id and user_id=auth.uid() returning * into source;
    if not found then raise exception 'Event not found' using errcode = '42501'; end if;
  end if;
  return next source;
  for week in 1..p_copy_count loop
    insert into public.events(user_id,title,description,event_date,start_time,end_time,all_day,color,note_id,recurrence,repeat_until)
    values(auth.uid(),source.title,source.description,source.event_date + week * 7,source.start_time,source.end_time,source.all_day,source.color,source.note_id,'none',null)
    returning * into copied;
    return next copied;
  end loop;
end;
$$;
revoke all on function public.save_event_with_copies(uuid,jsonb,integer) from public, anon;
grant execute on function public.save_event_with_copies(uuid,jsonb,integer) to authenticated;

-- Private tasks, using the same ownership model as notes and events.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 500),
  description text not null default '' constraint tasks_description_length check (char_length(description) <= 5000),
  due_date date constraint tasks_due_date_range check (due_date between date '0001-01-01' and date '9999-12-31'),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_created_idx on public.tasks(user_id, created_at desc);
alter table public.tasks enable row level security;
create policy "Users can read own tasks" on public.tasks for select to authenticated using ((select auth.uid())=user_id);
create policy "Users can insert own tasks" on public.tasks for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Users can update own tasks" on public.tasks for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Users can delete own tasks" on public.tasks for delete to authenticated using ((select auth.uid())=user_id);
revoke all on public.tasks from anon, authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
alter publication supabase_realtime add table public.tasks;

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

-- Private movie and TV watchlist.
create table public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) <= 200 and title ~ '[^[:space:]]'),
  kind text not null check (kind in ('movie', 'show')),
  watched_on date check (watched_on between date '0001-01-01' and date '9999-12-31'),
  created_at timestamptz not null default now()
);

create index watchlist_user_created_idx on public.watchlist (user_id, created_at desc);
alter table public.watchlist enable row level security;

create policy "Users manage their own watchlist" on public.watchlist
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.watchlist from public, anon, authenticated;
grant select, insert, update, delete on table public.watchlist to authenticated;
