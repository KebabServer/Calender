-- The existing watched date still takes precedence and older clients can keep writing it.
alter table public.watchlist add column started boolean not null default false;
