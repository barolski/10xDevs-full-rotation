-- Attendance marking + the no-show lockout (S-07). Fills in the is_blocked() seam that the sign-up
-- trigger (signups migration) already calls, and adds the attendance record that drives it.
--
-- The rule (decided during planning, FR-009/FR-022/FR-023/FR-024):
--   * Completed training = confirmed AND already started (starts_at <= now); cancelled never counts.
--   * Window for a target T = the 8 most recent completed group trainings with starts_at < T.
--   * A main-list absence on a windowed training = a marked 'absent' row OR a late withdrawal from
--     the main list (withdrawn after close, and the holder was main-list: promoted, or < 12 sign-ups
--     with a smaller position held a spot at close). Waitlist-only and early withdrawals never count.
--   * Blocked iff >= 2 absences in the window AND no completed training started after the most recent
--     absence (the penalty is the single next training; once one training passes it is served).
-- ABSENCE_WINDOW (8) and ABSENCE_LIMIT (2) are mirrored in src/lib/attendance.ts; this SQL is authoritative.

-- 1. Attendance: one present/absent row per (training, main-list player). Organizer-only, mirroring
--    training_ratings' RLS + least-privilege grants. marked_by/marked_at are owned by the default +
--    touch trigger, not grantable.
create table public.attendance (
  training_id uuid not null references public.trainings (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  status text not null check (status in ('present', 'absent')),
  marked_by uuid default auth.uid() references auth.users (id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (training_id, user_id)
);

-- The lockout reads attendance by user across trainings (absence lookup), so index that path.
create index attendance_user_idx on public.attendance (user_id);

alter table public.attendance enable row level security;

revoke all on public.attendance from anon, authenticated;
grant select on public.attendance to authenticated;
grant insert (training_id, user_id, status) on public.attendance to authenticated;
grant update (status) on public.attendance to authenticated;

create policy "attendance_select_organizer"
  on public.attendance for select to authenticated
  using ((select public.is_organizer()));

create policy "attendance_insert_organizer"
  on public.attendance for insert to authenticated
  with check ((select public.is_organizer()));

create policy "attendance_update_organizer"
  on public.attendance for update to authenticated
  using ((select public.is_organizer()))
  with check ((select public.is_organizer()));

create function public.attendance_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.marked_at := now();
  new.marked_by := auth.uid();
  return new;
end;
$$;

create trigger attendance_touch
  before update on public.attendance
  for each row
  execute function public.attendance_touch();

-- 2. lockout_absences: the start times of the player's main-list absences in the window. Shared by
--    is_blocked and block_info. security definer so it can read attendance (organizer-only RLS) on
--    behalf of a player; internal only (not granted to clients).
create function public.lockout_absences(p_user uuid, p_target uuid)
returns setof timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  with target as (select starts_at from public.trainings where id = p_target),
  window8 as (
    select t.id, t.starts_at, (t.starts_at - interval '3 hours') as close_at
    from public.trainings t, target
    where t.status = 'confirmed'
      and t.starts_at <= now()
      and t.starts_at < target.starts_at
    order by t.starts_at desc
    limit 8
  )
  select w.starts_at
  from window8 w
  where
    exists (
      select 1 from public.attendance a
      where a.training_id = w.id and a.user_id = p_user and a.status = 'absent'
    )
    or exists (
      select 1 from public.signups s
      where s.training_id = w.id and s.user_id = p_user
        and s.status = 'withdrawn' and s.withdrawn_at > w.close_at
        and (
          s.promoted_at is not null
          or (
            select count(*) from public.signups s2
            where s2.training_id = w.id and s2.position < s.position
              and s2.signed_up_at < w.close_at
              and (s2.status = 'active' or s2.withdrawn_at > w.close_at)
          ) < 12
        )
    );
$$;

revoke all on function public.lockout_absences(uuid, uuid) from public, anon, authenticated;

-- 3. is_blocked: replace the inert stub. >= 2 absences in the window, and the one-training penalty
--    not yet served (no completed training started after the most recent absence).
create or replace function public.is_blocked(p_user uuid, p_training uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_target timestamptz;
  v_count int;
  v_last timestamptz;
begin
  select starts_at into v_target from public.trainings where id = p_training;
  if v_target is null then
    return false;
  end if;

  select count(*), max(ts) into v_count, v_last
  from public.lockout_absences(p_user, p_training) as ts;

  if v_count < 2 then
    return false;
  end if;

  -- Served: a completed training started after the most recent absence (sat out or played) -> reset.
  if exists (
    select 1 from public.trainings t
    where t.status = 'confirmed'
      and t.starts_at <= now()
      and t.starts_at > v_last
      and t.starts_at < v_target
  ) then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.is_blocked(uuid, uuid) is
  'No-show lockout (S-07, FR-009): >= 2 main-list absences in the trailing 8 completed trainings, one-training penalty. Called by the sign-up trigger.';

-- 4. block_info: the player page reads its OWN block status + absence count (FR-010) via RPC. Uses
--    auth.uid(), so a player can only see their own status.
create function public.block_info(p_training uuid)
returns table (blocked boolean, absences int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_blocked((select auth.uid()), p_training) as blocked,
    (select count(*)::int from public.lockout_absences((select auth.uid()), p_training)) as absences;
$$;

revoke all on function public.block_info(uuid) from public, anon;
grant execute on function public.block_info(uuid) to authenticated;
