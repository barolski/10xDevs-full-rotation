-- Trainings (S-01): a training an organizer creates and shares as /t/<id>.
-- Every signed-in account may read trainings; only organizers may create or
-- edit them (public.is_organizer()), and nobody may delete them. anon has no
-- access at all: the share link requires signing in first.
--
-- Sign-ups close 3 hours before starts_at. The interval below mirrors
-- SIGNUP_CLOSE_HOURS in src/lib/trainings.ts; this value is authoritative.

create table public.trainings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  starts_at timestamptz not null,
  location text not null check (char_length(btrim(location)) between 1 and 120),
  note text check (char_length(note) <= 500),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trainings_starts_at_idx on public.trainings (starts_at);

alter table public.trainings enable row level security;

-- Supabase grants ALL on new public tables to anon/authenticated by default,
-- including TRUNCATE and DELETE. Close everything, then reopen only what the
-- app needs. Writes are limited to the editable columns, so clients can't set
-- id, created_by or the timestamps.
revoke all on public.trainings from anon, authenticated;
grant select on public.trainings to authenticated;
grant insert (title, starts_at, location, note) on public.trainings to authenticated;
grant update (title, starts_at, location, note) on public.trainings to authenticated;

create policy "trainings_select_authenticated"
  on public.trainings
  for select
  to authenticated
  using (true);

create policy "trainings_insert_organizer"
  on public.trainings
  for insert
  to authenticated
  with check ((select public.is_organizer()));

create policy "trainings_update_organizer"
  on public.trainings
  for update
  to authenticated
  using ((select public.is_organizer()))
  with check ((select public.is_organizer()));

-- Time rules, enforced for every writer:
--   * a training must start more than 3 hours from now (otherwise its sign-up
--     window has already closed);
--   * once sign-ups closed (OLD.starts_at - 3h), the training can't be edited,
--     so an edit can never reopen a closed window.
-- Fires only when an editable column is in the UPDATE's SET list, so later
-- status-only updates (S-03's close/confirm/cancel) pass through untouched.
create function public.trainings_guard_signup_window()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.starts_at - interval '3 hours' <= now() then
    raise exception 'training_signup_closed' using errcode = 'check_violation';
  end if;

  if new.starts_at - interval '3 hours' <= now() then
    raise exception 'training_starts_too_soon' using errcode = 'check_violation';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger trainings_guard_signup_window
  before insert or update of title, starts_at, location, note
  on public.trainings
  for each row
  execute function public.trainings_guard_signup_window();
