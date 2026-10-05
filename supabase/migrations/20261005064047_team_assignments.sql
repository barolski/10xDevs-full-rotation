-- Generated team assignments (S-06).
--
-- One row per assigned player: which team they are on for a given training, and
-- whether they were picked as a *substitute* setter (FR-018) because the roster
-- had too few real setters. Teams are PERSISTED, not recomputed on read, because
-- FR-019 patches a single vacated slot after a post-generation withdrawal without
-- regenerating both teams -- a derivation cannot record which team a player was on.
--
-- The substitute-setter flag lives ONLY here, for this training. It is deliberately
-- never written back to profiles.primary/secondary_position (PRD Non-goals: a
-- substitute assignment must not feed the rule back into the player's identity).
--
-- A missing rating is RATING_DEFAULT (5), handled by the generator, not here;
-- team_assignments stores no rating of its own.

create table public.team_assignments (
  training_id uuid not null references public.trainings (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  team text not null check (team in ('A', 'B')),
  is_substitute_setter boolean not null default false,
  generated_at timestamptz not null default now(),
  primary key (training_id, user_id)
);

-- Read by the generation index for a quick "does this training already have teams?"
-- and to render one team at a time.
create index team_assignments_team_idx on public.team_assignments (training_id, team);

alter table public.team_assignments enable row level security;

-- Supabase grants ALL on new public tables to anon/authenticated by default. Close
-- everything, then reopen only what the organizer UI needs. Unlike training_ratings,
-- delete IS granted: regeneration replaces a training's whole split (delete-then-insert),
-- and FR-019 deletes a vacated slot when the waitlist is empty. generated_at is not
-- grantable -- its column default owns it.
revoke all on public.team_assignments from anon, authenticated;
grant select on public.team_assignments to authenticated;
grant insert (training_id, user_id, team, is_substitute_setter) on public.team_assignments to authenticated;
grant update (team, is_substitute_setter) on public.team_assignments to authenticated;
grant delete on public.team_assignments to authenticated;

-- Organizers only, for every command. Teams are strategy the organizer owns; a player
-- never reads or writes them (a player learning the rating-driven split is out of scope,
-- same stance as training_ratings). The app gate (ORGANIZER_ROUTES) is not the boundary --
-- this RLS is.
create policy "team_assignments_select_organizer"
  on public.team_assignments
  for select
  to authenticated
  using ((select public.is_organizer()));

create policy "team_assignments_insert_organizer"
  on public.team_assignments
  for insert
  to authenticated
  with check ((select public.is_organizer()));

create policy "team_assignments_update_organizer"
  on public.team_assignments
  for update
  to authenticated
  using ((select public.is_organizer()))
  with check ((select public.is_organizer()));

create policy "team_assignments_delete_organizer"
  on public.team_assignments
  for delete
  to authenticated
  using ((select public.is_organizer()));
