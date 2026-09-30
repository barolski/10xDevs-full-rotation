-- Player positions constraint + per-training ratings (S-05).
--
-- Two changes S-05 owns, both flowing from S-02's "schema now, UI later" decision
-- (context/archive/2026-09-27-player-signup-and-withdraw/follow-ups/review-fixes.md):
--
-- 1. profiles: forbid a secondary position without a primary. The original
--    `profiles_positions_differ` CHECK uses `<>`, which is NULL (and so accepted)
--    while a position is unset -- that lets "secondary set, primary NULL" slip
--    through. A secondary logically implies a primary, and FR-018's setter logic
--    reads primary/secondary as an ordered pair, so the pair must not be
--    half-populated. Both existing rows are NULL/NULL, so this needs no backfill.
--
-- 2. ratings move from per-player to per-(training, player). player_ratings was a
--    single global rating per account; it has never been written (S-05 is its
--    first writer), so it is dropped rather than migrated. Storing a rating per
--    training lets the organizer see a player's rating move over time and feeds a
--    future progression dashboard. Team generation (S-06) now reads the rating for
--    the training it is generating; a missing row means the default, 5.

-- 1. Positions: a secondary requires a primary.
alter table public.profiles
  add constraint profiles_primary_required
  check (primary_position is not null or secondary_position is null);

-- 2. Replace the global ratings table with a per-training one.
-- Dropping the table cascades its RLS policies and its own touch trigger; the
-- standalone touch function is not owned by the table, so drop it explicitly.
drop table if exists public.player_ratings;
drop function if exists public.player_ratings_touch();

-- rating defaults to 5: an unrated player is treated as a middle rating rather
-- than a missing value, so S-06 never has to handle "no rating". Clearing a
-- rating deletes the row (the effective value falls back to 5), which is why
-- organizers need DELETE here where the old table granted none.
create table public.training_ratings (
  training_id uuid not null references public.trainings (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  rating numeric(3, 1) not null default 5 check (rating between 1 and 10),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (training_id, user_id)
);

alter table public.training_ratings enable row level security;

-- Supabase grants ALL on new public tables to anon/authenticated by default.
-- Close everything, then reopen only what the organizer UI needs. updated_by is
-- deliberately not grantable (a client could forge it); the column default and
-- the touch trigger own it.
revoke all on public.training_ratings from anon, authenticated;
grant select on public.training_ratings to authenticated;
grant insert (training_id, user_id, rating) on public.training_ratings to authenticated;
grant update (rating) on public.training_ratings to authenticated;
grant delete on public.training_ratings to authenticated;

-- Organizers only, for every command: a player must not learn any rating, not
-- even their own, and not by calling PostgREST directly.
create policy "training_ratings_select_organizer"
  on public.training_ratings
  for select
  to authenticated
  using ((select public.is_organizer()));

create policy "training_ratings_insert_organizer"
  on public.training_ratings
  for insert
  to authenticated
  with check ((select public.is_organizer()));

create policy "training_ratings_update_organizer"
  on public.training_ratings
  for update
  to authenticated
  using ((select public.is_organizer()))
  with check ((select public.is_organizer()));

create policy "training_ratings_delete_organizer"
  on public.training_ratings
  for delete
  to authenticated
  using ((select public.is_organizer()));

create function public.training_ratings_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger training_ratings_touch
  before update on public.training_ratings
  for each row
  execute function public.training_ratings_touch();
