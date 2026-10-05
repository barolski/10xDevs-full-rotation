-- Team slot inheritance on a post-generation withdrawal (S-06, FR-019).
--
-- When a main-list player withdraws after teams were generated, the waitlister who takes their
-- main-list spot inherits the vacated TEAM slot directly -- same team, no regeneration of either
-- side. If the departing player was that team's only setter, a substitute setter is re-picked
-- within that same team (FR-018). A waitlist withdrawal, or a withdrawal on a training with no
-- generated teams, changes nothing here.
--
-- Ordering: this is an AFTER UPDATE trigger on public.signups, like promote_after_withdrawal()
-- (waitlist_promotion migration). Postgres fires AFTER triggers in alphabetical trigger-name
-- order, so this trigger is named `zz_...` to run AFTER `promote_after_withdrawal`. The dependency
-- is defensive: this function does not read promoted_at -- it identifies the replacement as the
-- first-in-queue active sign-up that has no team assignment yet, which is exactly the player the
-- promotion trigger stamps -- but keeping the order makes the two agree by construction.
--
-- security definer, search_path pinned empty: like promote_after_withdrawal(), it rewrites a row
-- the withdrawing caller may not touch (another player's team_assignments row), so it runs as the
-- owner, not the caller.

create function public.inherit_team_slot_after_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team text;
  v_promoted uuid;
begin
  if not (old.status = 'active' and new.status = 'withdrawn') then
    return null;
  end if;

  -- Only when the withdrawing player held a generated team slot (teams exist and this was a
  -- main-list player). A waitlist withdrawal or an un-generated training has no row here.
  select ta.team into v_team
  from public.team_assignments ta
  where ta.training_id = new.training_id and ta.user_id = new.user_id;
  if v_team is null then
    return null;
  end if;

  -- The replacement is the lowest-position active sign-up that has no team assignment yet -- the
  -- first waitlister, i.e. exactly who promote_after_withdrawal() moves onto the main list.
  select s.user_id into v_promoted
  from public.signups s
  where s.training_id = new.training_id
    and s.status = 'active'
    and not exists (
      select 1 from public.team_assignments ta
      where ta.training_id = new.training_id and ta.user_id = s.user_id
    )
  order by s.position
  limit 1;

  if v_promoted is not null then
    -- Inherit the vacated slot in the same team (FR-019). Reset the substitute flag; the setter
    -- re-check below re-establishes it only if the team now lacks a setter.
    update public.team_assignments
    set user_id = v_promoted, is_substitute_setter = false
    where training_id = new.training_id and user_id = new.user_id;
  else
    -- Empty waitlist: no replacement, the slot is simply vacated.
    delete from public.team_assignments
    where training_id = new.training_id and user_id = new.user_id;
  end if;

  -- Setter guarantee for the affected team: if it now has no setter at all -- neither a real one
  -- (profile primary/secondary = 'setter') nor a substitute -- flag its highest-rated remaining
  -- member as a substitute setter (FR-018). "Rating" is the player's average over PAST trainings
  -- (same as generation); a player with no past rating counts as 0, and position breaks ties.
  if exists (
       select 1 from public.team_assignments ta
       where ta.training_id = new.training_id and ta.team = v_team
     )
     and not exists (
       select 1
       from public.team_assignments ta
       join public.profiles p on p.user_id = ta.user_id
       where ta.training_id = new.training_id and ta.team = v_team
         and (p.primary_position = 'setter' or p.secondary_position = 'setter' or ta.is_substitute_setter)
     )
  then
    update public.team_assignments
    set is_substitute_setter = true
    where training_id = new.training_id and user_id = (
      select ta.user_id
      from public.team_assignments ta
      join public.signups s
        on s.training_id = new.training_id and s.user_id = ta.user_id
      where ta.training_id = new.training_id and ta.team = v_team
      order by (
        select coalesce(avg(tr.rating), 0)
        from public.training_ratings tr
        join public.trainings t2 on t2.id = tr.training_id
        where tr.user_id = ta.user_id
          and t2.starts_at < (select t3.starts_at from public.trainings t3 where t3.id = new.training_id)
      ) desc, s.position asc
      limit 1
    );
  end if;

  return null;
end;
$$;

comment on function public.inherit_team_slot_after_withdrawal() is
  'AFTER UPDATE trigger: on a post-generation main-list withdrawal, moves the promoted waitlister into the vacated team slot (FR-019) and re-picks a substitute setter if the team lost its only one (FR-018). No-op when teams were never generated or a waitlister withdrew.';

-- Only ever invoked by the trigger below; no one should call it directly.
revoke all on function public.inherit_team_slot_after_withdrawal() from public;

create trigger zz_inherit_team_slot_after_withdrawal
  after update on public.signups
  for each row
  execute function public.inherit_team_slot_after_withdrawal();
