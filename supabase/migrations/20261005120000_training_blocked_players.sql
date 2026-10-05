-- Roster status (S-08, FR-011): a batch read of the players blocked for one training, for the
-- organizer's roster view. Without it the organizer can only ask is_blocked() one player at a time,
-- and block_info() reads only the caller's own status.
--
-- The rule is not repeated here: it is is_blocked() (attendance_and_lockout migration), applied to
-- every profile. This function is organizer-only and fails closed: a non-organizer gets an error,
-- never an empty set (an empty set would read as "nobody is blocked").

create function public.training_blocked_players(p_training uuid)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_organizer()) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;

  return query
    select p.user_id
    from public.profiles p
    where public.is_blocked(p.user_id, p_training);
end;
$$;

revoke all on function public.training_blocked_players(uuid) from public, anon;
grant execute on function public.training_blocked_players(uuid) to authenticated;

comment on function public.training_blocked_players(uuid) is
  'Roster status (S-08, FR-011): user ids blocked for a training by the no-show lockout. Organizer-only; raises 42501 for anyone else.';
