-- Sign-ups (S-02): one row per sign-up attempt on a training.
--
-- `position` is the queue number the database hands out, in sign-up order
-- (FR-007). Placement is NOT stored: the main list is the first 12 *active*
-- sign-ups by position and the rest is the waitlist, so a withdrawal before
-- sign-ups close pulls the next player up with no extra write. The 12 mirrors
-- MAIN_LIST_SIZE in src/lib/signups.ts; the 120-minute overlap window below
-- mirrors OVERLAP_WINDOW_MINUTES in the same file. The 3-hour sign-up window is
-- owned by the trainings migration, which is authoritative for that value.
--
-- A withdrawal never deletes the row: it flips `status` and stamps
-- `withdrawn_at`, because S-07 (mark-attendance-and-lockout) has to tell a late
-- withdrawal (counts as an absence, FR-023) from an early one. Signing up again
-- inserts a NEW row with a fresh tail position, so nobody jumps the queue.
--
-- user_id references public.profiles, not auth.users, so PostgREST can embed the
-- nickname into a roster query; the profiles trigger guarantees the row exists.

create table public.signups (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.trainings (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  position integer not null,
  status text not null default 'active' check (status in ('active', 'withdrawn')),
  signed_up_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  constraint signups_withdrawn_at_matches_status check ((status = 'withdrawn') = (withdrawn_at is not null))
);

-- One queue number per training, ever: the backstop if the advisory lock below
-- is ever removed. Withdrawn rows keep their number, so max() + 1 never collides.
create unique index signups_training_position_idx on public.signups (training_id, position);

-- At most one active sign-up per player per training; a withdrawn row does not
-- block signing up again.
create unique index signups_one_active_per_player_idx
  on public.signups (training_id, user_id)
  where status = 'active';

create index signups_user_status_idx on public.signups (user_id, status);
create index signups_roster_idx on public.signups (training_id, status, position);

alter table public.signups enable row level security;

-- Supabase grants ALL on new public tables to anon/authenticated by default,
-- including TRUNCATE and DELETE. Close everything, then reopen the narrowest
-- surface the app needs: a client may name only the training. user_id comes from
-- the auth.uid() default, position and withdrawn_at from the triggers, and the
-- only permitted update is the status flip.
revoke all on public.signups from anon, authenticated;
grant select on public.signups to authenticated;
grant insert (training_id) on public.signups to authenticated;
grant update (status) on public.signups to authenticated;

-- Players see both rosters (FR-012) but not who quietly withdrew; their own rows
-- and everything organizer-side stay visible to the people entitled to them.
create policy "signups_select_active_or_own_or_organizer"
  on public.signups
  for select
  to authenticated
  using (status = 'active' or user_id = (select auth.uid()) or (select public.is_organizer()));

create policy "signups_insert_own"
  on public.signups
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "signups_update_own_active"
  on public.signups
  for update
  to authenticated
  using (user_id = (select auth.uid()) and status = 'active')
  with check (user_id = (select auth.uid()));

-- The next queue number for a training, counting EVERY row — including sign-ups
-- the caller cannot see.
--
-- This has to be security definer. The select policy below hides another
-- player's withdrawn row, so computing max(position) as the caller returns a
-- number that is already taken the moment anyone withdraws: the next player
-- collides with signups_training_position_idx, and because only the withdrawer
-- and organizers can see that row, sign-ups stay broken for everyone else.
-- Same reason is_organizer() and is_blocked() are definer.
create function public.next_signup_position(p_training uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select coalesce(max(position), 0) + 1 from public.signups where training_id = p_training;
$$;

comment on function public.next_signup_position(uuid) is
  'Trigger helper: next queue number for a training, counting rows RLS hides from the caller.';

-- signups_assign_position() runs with invoker rights, so it calls this as the
-- signed-in user; anon has no business with it.
revoke execute on function public.next_signup_position(uuid) from public, anon;
grant execute on function public.next_signup_position(uuid) to authenticated;

-- Admission rules and the queue number, in one serialized transaction.
--
-- The advisory lock is what makes the position read safe: two players racing for
-- the last main-list slot are serialized per training. A row lock on
-- public.trainings could not do this job — SELECT ... FOR UPDATE needs UPDATE
-- privilege and passes through trainings_update_organizer (USING is_organizer()),
-- so a player would lock nothing.
--
-- Invoker rights on purpose: the overlap check below must stay scoped to the
-- caller's own sign-ups. The one read that must see other people's rows goes
-- through next_signup_position() above.
create function public.signups_assign_position()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_starts timestamptz;
begin
  -- Two locks, always in this order (training, then user) so concurrent inserts can never deadlock.
  -- The training lock serializes the queue number. The user lock serializes the overlap check below,
  -- which is a per-player invariant spanning two trainings: without it, two parallel sign-ups by the
  -- same player for overlapping trainings take different training locks, neither sees the other's
  -- uncommitted row under READ COMMITTED, and both commit.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.training_id::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 1));

  select starts_at into v_starts from public.trainings where id = new.training_id;
  if not found then
    raise exception 'training_not_found' using errcode = 'check_violation';
  end if;

  if v_starts - interval '3 hours' <= now() then
    raise exception 'signup_closed' using errcode = 'check_violation';
  end if;

  if public.is_blocked(new.user_id, new.training_id) then
    raise exception 'player_blocked' using errcode = 'check_violation';
  end if;

  -- A player may not hold two active sign-ups for trainings starting less than
  -- 120 minutes apart (roadmap Open Question #2, resolved 2026-09-27). The
  -- waitlist counts: a waitlisted player can be promoted (FR-016), which would
  -- turn the double booking into a real clash.
  --
  -- Enforced at sign-up time ONLY. An organizer may still move a training's
  -- starts_at while its window is open (trainings_update_organizer, PRD FR-005
  -- last-write-wins), and nothing re-validates existing sign-ups, so an edit can
  -- leave a player holding two sign-ups this rule would have refused. S-04 and
  -- S-07 inherit that: do not assume the invariant holds for existing rows.
  if exists (
    select 1
    from public.signups s
    join public.trainings t on t.id = s.training_id
    where s.user_id = new.user_id
      and s.status = 'active'
      and s.training_id <> new.training_id
      and abs(extract(epoch from (t.starts_at - v_starts))) < 120 * 60
  ) then
    raise exception 'overlapping_signup' using errcode = 'check_violation';
  end if;

  new.position := public.next_signup_position(new.training_id);

  return new;
end;
$$;

create trigger signups_assign_position
  before insert on public.signups
  for each row
  execute function public.signups_assign_position();

-- Withdrawal is the only update, and it is one-way. Deliberately NOT gated on
-- the sign-up window: FR-023 (a late withdrawal counts as an absence) and FR-016
-- (promotion after a post-confirmation withdrawal) both need post-close
-- withdrawal to exist. S-02's UI offers it only while sign-ups are open.
create function public.signups_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.training_id <> old.training_id
     or new.user_id <> old.user_id
     or new.position <> old.position
     or new.signed_up_at <> old.signed_up_at then
    raise exception 'signup_immutable' using errcode = 'check_violation';
  end if;

  if not (old.status = 'active' and new.status = 'withdrawn') then
    raise exception 'signup_immutable' using errcode = 'check_violation';
  end if;

  new.withdrawn_at := now();
  return new;
end;
$$;

create trigger signups_guard_update
  before update on public.signups
  for each row
  execute function public.signups_guard_update();
