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
  note_id uuid references public.notes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_time_order check (all_day or (start_time is not null and end_time is not null and end_time > start_time))
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
