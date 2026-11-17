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
