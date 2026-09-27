-- Player profiles, ratings and the block hook (S-02).
--
-- profiles: one row per account, created automatically by a trigger on
-- auth.users, because auth.users itself is not readable by client roles and a
-- roster has to be able to name people (FR-012). The nickname is what rosters
-- show; it starts as the e-mail local part and the player edits it on /profile.
-- first_name, last_name and the two positions are the columns S-05
-- (player-positions-and-ratings) will fill — nullable and unwritten until then.
--
-- player_ratings is a separate table on purpose: the rating must be visible to
-- organizers only (PRD Access Control), and column-level grants apply to the
-- whole `authenticated` role, so they cannot hide a column from players while
-- leaving it readable for organizers. Row level is the level RLS enforces.
--
-- is_blocked() is the seam for the no-show lockout (FR-009/FR-010). It returns
-- false until S-07 (mark-attendance-and-lockout) fills it in from attendance;
-- the sign-up path already calls it, so that slice changes no other code.

create type public.player_position as enum ('setter', 'outside', 'opposite', 'middle', 'libero');

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 40),
  first_name text check (char_length(btrim(first_name)) <= 40),
  last_name text check (char_length(btrim(last_name)) <= 40),
  primary_position public.player_position,
  secondary_position public.player_position,
  -- `<>` (not `is distinct from`) on purpose: it yields NULL — which a CHECK accepts — while a
  -- position is unset, and rejects only a secondary that repeats the primary.
  constraint profiles_positions_differ check (secondary_position <> primary_position),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Supabase grants ALL on new public tables to anon/authenticated by default,
-- including TRUNCATE and DELETE. Close everything, then reopen only what the
-- app needs. There is no client INSERT path: the auth.users trigger below owns
-- row creation, so a profile can never be missing or duplicated.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (nickname, first_name, last_name, primary_position, secondary_position) on public.profiles to authenticated;

-- Every signed-in account reads every profile: the main list and waitlist name
-- everyone on them (FR-012). Only the owner writes their own row.
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create function public.profiles_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row
  execute function public.profiles_touch_updated_at();

-- The nickname seed is the e-mail local part, capped at the column's 40 chars.
-- An account without a usable local part (empty or whitespace-only) falls back
-- to 'player' rather than failing the insert and breaking sign-up.
create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nickname text;
begin
  v_nickname := left(nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''), 40);

  insert into public.profiles (user_id, nickname)
  values (new.id, coalesce(v_nickname, 'player'))
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger create_profile_for_new_user
  after insert on auth.users
  for each row
  execute function public.create_profile_for_new_user();

-- Accounts that already exist (local seed, production) get their profile here;
-- the trigger covers every account created from now on.
insert into public.profiles (user_id, nickname)
select u.id, coalesce(left(nullif(btrim(split_part(coalesce(u.email, ''), '@', 1)), ''), 40), 'player')
from auth.users u
on conflict (user_id) do nothing;

-- Organizer-set rating, 1.0-10.0 (fractional values are intended). Written by
-- organizers in S-05, read by team generation in S-06.
create table public.player_ratings (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  rating numeric(3, 1) not null check (rating between 1 and 10),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.player_ratings enable row level security;

revoke all on public.player_ratings from anon, authenticated;
grant select on public.player_ratings to authenticated;
grant insert (user_id, rating) on public.player_ratings to authenticated;
grant update (rating) on public.player_ratings to authenticated;

-- Organizers only, for every command: a player must not learn their own rating
-- either, not even by calling PostgREST directly.
create policy "player_ratings_select_organizer"
  on public.player_ratings
  for select
  to authenticated
  using ((select public.is_organizer()));

create policy "player_ratings_insert_organizer"
  on public.player_ratings
  for insert
  to authenticated
  with check ((select public.is_organizer()));

create policy "player_ratings_update_organizer"
  on public.player_ratings
  for update
  to authenticated
  using ((select public.is_organizer()))
  with check ((select public.is_organizer()));

-- updated_by is not grantable to clients (they could forge it), so it is set
-- here alongside the timestamp.
create function public.player_ratings_touch()
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

create trigger player_ratings_touch
  before update on public.player_ratings
  for each row
  execute function public.player_ratings_touch();

-- The no-show lockout hook (FR-009/FR-010). Always false until S-07 fills it
-- in from attendance; the sign-up trigger in the signups migration calls it, so
-- that slice only replaces this body.
create function public.is_blocked(p_user uuid, p_training uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

comment on function public.is_blocked(uuid, uuid) is
  'Inert until S-07 (mark-attendance-and-lockout): returns false for every player. FR-009/FR-010.';

revoke execute on function public.is_blocked(uuid, uuid) from public, anon;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;
