alter table public.watchlist
  add column description text not null default ''
  constraint watchlist_description_length check (char_length(description) <= 5000);
