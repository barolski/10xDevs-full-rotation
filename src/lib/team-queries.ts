import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";
import { loadRoster } from "@/lib/signup-queries";
import { splitRoster } from "@/lib/signups";
import { RATING_DEFAULT } from "@/lib/ratings";
import type { PlayerPosition } from "@/lib/profiles";
import type { AssignedPlayer, TeamId, TeamPlayer } from "@/lib/teams";

// Server-only (reads secrets through createClient): the bridge between the DB and the pure
// generateTeams() in src/lib/teams.ts, mirroring src/lib/signup-queries.ts. Builds TeamPlayer[]
// from the confirmed main-list roster joined to ratings and positions, persists a generated
// split (replace-all), and loads an existing one for display.

// A numeric rating can arrive from PostgREST as a string, so Number() normalises it (same as
// loadOrSeedTrainingRatings). A player with no rating row is RATING_DEFAULT — generateTeams never
// has to reason about "no rating".
export interface TeamPlayersLoad {
  players: TeamPlayer[];
  failed: boolean;
}

export async function loadTeamPlayers(
  trainingId: string,
  headers: Headers,
  cookies: AstroCookies,
): Promise<TeamPlayersLoad> {
  const { entries, failed } = await loadRoster(trainingId, headers, cookies);
  if (failed) return { players: [], failed: true };
  const main = splitRoster(entries).main;
  if (main.length === 0) return { players: [], failed: false };

  const supabase = createClient(headers, cookies);
  if (!supabase) return { players: [], failed: true };
  const userIds = main.map((entry) => entry.user_id);

  const { data: ratingRows, error: ratingError } = await supabase
    .from("training_ratings")
    .select("user_id, rating")
    .eq("training_id", trainingId)
    .overrideTypes<{ user_id: string; rating: number | string }[], { merge: false }>();
  if (ratingError) return { players: [], failed: true };
  const ratingOf = new Map(ratingRows.map((row) => [row.user_id, Number(row.rating)]));

  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, primary_position, secondary_position")
    .in("user_id", userIds)
    .overrideTypes<
      { user_id: string; primary_position: PlayerPosition | null; secondary_position: PlayerPosition | null }[],
      { merge: false }
    >();
  if (profileError) return { players: [], failed: true };
  const positionsOf = new Map(
    profileRows.map((row) => [row.user_id, { primary: row.primary_position, secondary: row.secondary_position }]),
  );

  const players: TeamPlayer[] = main.map((entry) => {
    const positions = positionsOf.get(entry.user_id);
    return {
      user_id: entry.user_id,
      nickname: entry.nickname,
      position: entry.position,
      rating: ratingOf.get(entry.user_id) ?? RATING_DEFAULT,
      primaryPosition: positions?.primary ?? null,
      secondaryPosition: positions?.secondary ?? null,
    };
  });
  return { players, failed: false };
}

// Replace a training's whole split: delete the existing rows, then insert the new ones. Two
// organizers regenerating at once settle last-write-wins (FR-005); there is no single-statement
// transaction across PostgREST calls, which is acceptable for this casual, single-group app.
export async function saveTeams(
  trainingId: string,
  assigned: AssignedPlayer[],
  headers: Headers,
  cookies: AstroCookies,
): Promise<{ failed: boolean }> {
  const supabase = createClient(headers, cookies);
  if (!supabase) return { failed: true };

  const { error: deleteError } = await supabase.from("team_assignments").delete().eq("training_id", trainingId);
  if (deleteError) return { failed: true };

  if (assigned.length === 0) return { failed: false };

  const { error: insertError } = await supabase.from("team_assignments").insert(
    assigned.map((player) => ({
      training_id: trainingId,
      user_id: player.user_id,
      team: player.team,
      is_substitute_setter: player.isSubstituteSetter,
    })),
  );
  if (insertError) return { failed: true };
  return { failed: false };
}

interface TeamAssignmentRow {
  user_id: string;
  team: TeamId;
  is_substitute_setter: boolean;
  // PostgREST embeds the profile because team_assignments.user_id references profiles.user_id.
  profiles: { nickname: string; primary_position: PlayerPosition | null; secondary_position: PlayerPosition | null };
}

export interface TeamsLoad {
  assignments: AssignedPlayer[];
  failed: boolean;
}

export async function loadTeams(trainingId: string, headers: Headers, cookies: AstroCookies): Promise<TeamsLoad> {
  const supabase = createClient(headers, cookies);
  if (!supabase) return { assignments: [], failed: true };

  const { data, error } = await supabase
    .from("team_assignments")
    .select("user_id, team, is_substitute_setter, profiles!inner(nickname, primary_position, secondary_position)")
    .eq("training_id", trainingId)
    .overrideTypes<TeamAssignmentRow[], { merge: false }>();
  if (error) return { assignments: [], failed: true };
  if (data.length === 0) return { assignments: [], failed: false };

  const { data: ratingRows, error: ratingError } = await supabase
    .from("training_ratings")
    .select("user_id, rating")
    .eq("training_id", trainingId)
    .overrideTypes<{ user_id: string; rating: number | string }[], { merge: false }>();
  if (ratingError) return { assignments: [], failed: true };
  const ratingOf = new Map(ratingRows.map((row) => [row.user_id, Number(row.rating)]));

  // Sign-up position drives the deterministic tie-break, same as generation.
  const { entries, failed: rosterFailed } = await loadRoster(trainingId, headers, cookies);
  if (rosterFailed) return { assignments: [], failed: true };
  const positionOf = new Map(entries.map((entry) => [entry.user_id, entry.position]));

  const assignments: AssignedPlayer[] = data.map((row) => ({
    user_id: row.user_id,
    nickname: row.profiles.nickname,
    position: positionOf.get(row.user_id) ?? 0,
    rating: ratingOf.get(row.user_id) ?? RATING_DEFAULT,
    primaryPosition: row.profiles.primary_position,
    secondaryPosition: row.profiles.secondary_position,
    team: row.team,
    isSubstituteSetter: row.is_substitute_setter,
  }));

  // Team, then rating desc, then sign-up position: stable order for the two-column display.
  assignments.sort((a, b) => a.team.localeCompare(b.team) || b.rating - a.rating || a.position - b.position);
  return { assignments, failed: false };
}
