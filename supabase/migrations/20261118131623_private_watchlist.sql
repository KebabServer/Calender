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
