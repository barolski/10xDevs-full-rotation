-- An absent player has no rating for that training.
--
-- When a player's attendance becomes 'absent', their training_ratings row for the same training is
-- deleted, so the past-rating averages (src/lib/team-queries.ts and inherit_team_slot_after_withdrawal)
-- stop counting a session they did not play. Marking them 'present' again is handled by the app,
-- which re-creates a default rating.
--
-- security definer, search_path pinned empty: `authenticated` has no DELETE grant on training_ratings
-- (least privilege, see positions_and_training_ratings), so the delete runs as the owner, not the
-- caller. Fired by the organizer's attendance write, which RLS already restricts to organizers.

create function public.clear_rating_when_absent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.training_ratings
  where training_id = new.training_id and user_id = new.user_id;
  return null;
end;
$$;

comment on function public.clear_rating_when_absent() is
  'AFTER INSERT/UPDATE trigger on attendance: deletes the player''s rating for that training when they are marked absent.';

-- Only ever invoked by the trigger below; no one should call it directly.
revoke all on function public.clear_rating_when_absent() from public;

create trigger clear_rating_when_absent
  after insert or update of status on public.attendance
  for each row
  when (new.status = 'absent')
  execute function public.clear_rating_when_absent();

-- Existing data: drop the ratings of players who are already marked absent.
delete from public.training_ratings tr
using public.attendance a
where a.training_id = tr.training_id
  and a.user_id = tr.user_id
  and a.status = 'absent';
