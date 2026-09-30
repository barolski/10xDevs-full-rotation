-- Waitlist auto-promotion (S-04): when a main-list player withdraws AFTER the
-- training is confirmed, the first waitlisted player takes the freed slot (FR-016).
--
-- Placement is already derived, not stored (src/lib/signups.ts splitRoster): the
-- first MAIN_LIST_SIZE (12) active sign-ups by position are the main list, so a
-- withdrawal pulls the next player up on the next roster read with no write. What
-- that derivation cannot record is the MOMENT a waitlisted player became a
-- main-list player -- and S-07 needs it: a promoted player's absence counter
-- starts only at promotion (FR-024), and a late withdrawal by a promoted player
-- counts as an absence (FR-023) while a waitlist withdrawal is free. That moment is
-- knowable only when it happens, so this migration stamps it as promoted_at.
--
-- promoted_at is deliberately absent from the signups update grant (see the signups
-- migration): no client can set it. Only promote_after_withdrawal() below writes it,
-- and it is one-way (null -> a timestamp, never rewritten).

alter table public.signups
  add column promoted_at timestamptz;

comment on column public.signups.promoted_at is
  'When a waitlisted sign-up was promoted to the main list after confirmation (FR-016). Null until promoted; written only by promote_after_withdrawal().';

-- Extend the update guard to allow the promotion stamp.
--
-- signups_guard_update rejects every update that is not the one-way active ->
-- withdrawn flip, so the promote_after_withdrawal() UPDATE below -- which changes
-- only promoted_at on an active row -- would be rejected as signup_immutable. Add
-- one narrow allowed shape (active row, promoted_at null -> non-null, nothing else
-- moved) ahead of the withdrawal rule, and keep promoted_at immutable on every
-- other path so a stamp can never be rewritten or cleared.
create or replace function public.signups_guard_update()
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

  -- Promotion stamp (S-04): an active row gaining its promoted_at, nothing else.
  -- Reachable only from promote_after_withdrawal() (security definer); no client
  -- can, since promoted_at is not in the update grant. withdrawn_at is left null
  -- here on purpose -- the row is still active.
  if old.status = 'active' and new.status = 'active'
     and old.promoted_at is null and new.promoted_at is not null
     and new.withdrawn_at is not distinct from old.withdrawn_at then
    return new;
  end if;

  -- The only other allowed update is the one-way active -> withdrawn flip; it must
  -- carry promoted_at through unchanged (a promoted player keeps their stamp).
  if not (old.status = 'active' and new.status = 'withdrawn') then
    raise exception 'signup_immutable' using errcode = 'check_violation';
  end if;
  if new.promoted_at is distinct from old.promoted_at then
    raise exception 'signup_immutable' using errcode = 'check_violation';
  end if;

  new.withdrawn_at := now();
  return new;
end;
$$;

-- Promote the first waitlisted player after a post-confirmation main-list withdrawal.
--
-- security definer on purpose, like next_signup_position(): the withdrawing caller
-- may update only their OWN active row (RLS signups_update_own_active) and cannot
-- write promoted_at at all (no column grant). Promoting a DIFFERENT player's row
-- therefore has to run as the owner. search_path is pinned empty.
--
-- Fires only on the active -> withdrawn transition, so the promotion stamp it issues
-- (active -> active) cannot recurse into a second promotion. No availability or
-- overlap re-check: FR-016 promotes the first waitlisted player unconditionally
-- (its Socratic resolution is explicit), and the sign-up overlap rule is enforced
-- at sign-up time only.
create function public.promote_after_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (old.status = 'active' and new.status = 'withdrawn') then
    return null;
  end if;

  -- Post-confirmation only (FR-016). Before close the roster is still fluid and no
  -- counter has started; a cancelled training has no main list to promote into.
  if not exists (
    select 1 from public.trainings t
    where t.id = new.training_id and t.status = 'confirmed'
  ) then
    return null;
  end if;

  -- The withdrawn row was on the main list iff fewer than MAIN_LIST_SIZE (12,
  -- mirrors src/lib/signups.ts) active rows sit ahead of it by position. A
  -- waitlisted withdrawal frees no main slot, so it promotes no one.
  if (
    select count(*) from public.signups s
    where s.training_id = new.training_id
      and s.status = 'active'
      and s.position < old.position
  ) >= 12 then
    return null;
  end if;

  -- Promote the active row now at rank 12 -- the 12th smallest position (offset 11).
  -- When the withdrawn row was on the main list, that row was rank 13 a moment ago:
  -- the first waitlister. If no 12th active row exists the waitlist was empty and
  -- nobody is promoted. Idempotent: an already-stamped row keeps its promoted_at.
  update public.signups
  set promoted_at = now()
  where id = (
    select s.id from public.signups s
    where s.training_id = new.training_id
      and s.status = 'active'
    order by s.position
    offset 11 limit 1
  )
  and promoted_at is null;

  return null;
end;
$$;

comment on function public.promote_after_withdrawal() is
  'AFTER UPDATE trigger: on a post-confirmation main-list withdrawal, stamps promoted_at on the first waitlisted player (FR-016). Idempotent, non-recursive.';

-- Only ever invoked by the trigger below; no one should call it directly.
revoke all on function public.promote_after_withdrawal() from public;

create trigger promote_after_withdrawal
  after update on public.signups
  for each row
  execute function public.promote_after_withdrawal();
