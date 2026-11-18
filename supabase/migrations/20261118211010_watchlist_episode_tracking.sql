-- Keep older clients compatible and preserve existing owner-scoped access.
alter table public.watchlist
  add column season smallint,
  add column episode smallint,
  add constraint watchlist_valid_episode check (
    (season is null and episode is null)
    or (season is not null and episode is not null and season between 0 and 999 and episode between 1 and 9999)
  );
