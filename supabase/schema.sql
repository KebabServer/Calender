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
