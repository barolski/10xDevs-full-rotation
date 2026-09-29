-- Training status (S-03): the confirmed/cancelled outcome the cron finalizes
-- once a training's sign-up window closes (FR-013/014/015, US-02).
--
-- Sign-ups are ALREADY hard-closed at starts_at - 3h by signups_assign_position()
-- in the signups migration; that value is authoritative. This migration does not
-- close sign-ups — it computes and PERSISTS the outcome, because S-07 has to read
-- "was this cancelled?" (a cancelled training does not count toward a player's
-- absence window, FR-023/FR-014) and the decision is a point-in-time event.
--
-- `status` is deliberately absent from the trainings insert/update grants (see the
-- trainings migration): no client, organizer included, can set it. Only
-- close_due_trainings() below writes it, and the transition is one-way
-- (open -> confirmed/cancelled) with no manual override (PRD Non-Goals).

alter table public.trainings
  add column status text not null default 'open'
    check (status in ('open', 'confirmed', 'cancelled')),
  add column closed_at timestamptz;

-- The finalizer the cron worker calls every 15 minutes.
--
-- security definer on purpose: the worker runs in Cloudflare's scheduled handler
-- with no user session, so it authenticates as anon and RLS trainings_update_organizer
-- (USING is_organizer()) would reject the write. Same reason is_organizer(),
-- is_blocked() and next_signup_position() are definer.
--
-- Idempotent and time-gated by construction: it only touches trainings that are
-- still 'open' AND already past their close time. A caller can neither confirm a
-- training early nor re-decide a finalized one, so granting execute to anon (the
-- worker's role) exposes nothing an attacker gains from -- the worst case is
-- running the same batch the next cron tick would run anyway.
--
-- It sets ONLY status and closed_at. Putting an editable column (title, starts_at,
-- location, note) in the SET list -- even unchanged -- would fire
-- trainings_guard_signup_window, which raises training_signup_closed after the
-- window closed (S-01 impl-review F4). closed_at is this slice's own timestamp:
-- that trigger, which is what bumps updated_at, never fires here.
--
-- The main list holds 12 (MAIN_LIST_SIZE) and the minimum to confirm is 10
-- (MIN_CONFIRMED in src/lib/signups.ts, mirrored here; this migration is
-- authoritative). Because 10 <= 12, "at least 10 on the main list" is exactly
-- "at least 10 active sign-ups", so the count needs no slicing of the first 12.
create function public.close_due_trainings()
returns integer
language sql
security definer
set search_path = ''
as $$
  with closed as (
    update public.trainings t
    set status = case
          when (
            select count(*)
            from public.signups s
            where s.training_id = t.id and s.status = 'active'
          ) >= 10
          then 'confirmed'
          else 'cancelled'
        end,
        closed_at = now()
    where t.status = 'open'
      and t.starts_at - interval '3 hours' <= now()
    returning 1
  )
  select count(*)::int from closed;
$$;

comment on function public.close_due_trainings() is
  'Cron finalizer: marks every open, past-close training confirmed (>=10 active sign-ups) or cancelled. Idempotent and time-gated.';

-- Only the worker (anon) and, incidentally, signed-in users may run it; it is safe
-- for both because of the time gate above. Never public/anon by default accident:
-- revoke first, then grant explicitly, matching next_signup_position().
revoke execute on function public.close_due_trainings() from public;
grant execute on function public.close_due_trainings() to anon, authenticated;
