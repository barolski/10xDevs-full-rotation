import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";
import { loadRoster } from "@/lib/signup-queries";
import { splitRoster } from "@/lib/signups";
import type { PlayerPosition } from "@/lib/profiles";
import { UNRATED_RATING, type AssignedPlayer, type TeamId, type TeamPlayer } from "@/lib/teams";

// Server-only (reads secrets through createClient): the bridge between the DB and the pure
// generateTeams() in src/lib/teams.ts, mirroring src/lib/signup-queries.ts. Builds TeamPlayer[]
// from the confirmed main-list roster joined to past-average ratings and positions, persists a
// generated split (replace-all), and loads an existing one for display.

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

interface PastRatingRow {
  user_id: string;
  rating: number | string;
  // PostgREST embeds the training (training_ratings.training_id -> trainings.id) for its start time.
  trainings: { starts_at: string };
}

// Each player's rating for generation is the AVERAGE of their organizer-set ratings over PAST
// trainings -- those that started before this one. The upcoming training's own ratings are
// excluded (they don't exist yet and must not feed its own split). A player with no past rating is
// absent from the map and treated as UNRATED_RATING (0) by callers. A numeric can arrive from
// PostgREST as a string, so Number() normalises it.
async function loadPastAverageRatings(
  supabase: SupabaseClient,
  startsAt: string,
  userIds: string[],
): Promise<{ ratingOf: Map<string, number>; failed: boolean }> {
  if (userIds.length === 0) return { ratingOf: new Map(), failed: false };

  const { data, error } = await supabase
    .from("training_ratings")
    .select("user_id, rating, trainings!inner(starts_at)")
    .in("user_id", userIds)
    .overrideTypes<PastRatingRow[], { merge: false }>();
  if (error) return { ratingOf: new Map(), failed: true };

  const currentMs = new Date(startsAt).getTime();
  const totals = new Map<string, { sum: number; count: number }>();
  for (const row of data) {
    if (new Date(row.trainings.starts_at).getTime() >= currentMs) continue; // skip this/future trainings
    const entry = totals.get(row.user_id) ?? { sum: 0, count: 0 };
    entry.sum += Number(row.rating);
    entry.count += 1;
    totals.set(row.user_id, entry);
  }
  return { ratingOf: new Map([...totals].map(([userId, { sum, count }]) => [userId, sum / count])), failed: false };
}

export interface TeamPlayersLoad {
  players: TeamPlayer[];
  failed: boolean;
}

export async function loadTeamPlayers(
  trainingId: string,
  startsAt: string,
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

  const { ratingOf, failed: ratingFailed } = await loadPastAverageRatings(supabase, startsAt, userIds);
  if (ratingFailed) return { players: [], failed: true };

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
      rating: ratingOf.get(entry.user_id) ?? UNRATED_RATING,
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

export async function loadTeams(
  trainingId: string,
  startsAt: string,
  headers: Headers,
  cookies: AstroCookies,
): Promise<TeamsLoad> {
  const supabase = createClient(headers, cookies);
  if (!supabase) return { assignments: [], failed: true };

  const { data, error } = await supabase
    .from("team_assignments")
    .select("user_id, team, is_substitute_setter, profiles!inner(nickname, primary_position, secondary_position)")
    .eq("training_id", trainingId)
    .overrideTypes<TeamAssignmentRow[], { merge: false }>();
  if (error) return { assignments: [], failed: true };
  if (data.length === 0) return { assignments: [], failed: false };

  // Show the same rating the split was balanced on: the player's past-training average (0 if none).
  const { ratingOf, failed: ratingFailed } = await loadPastAverageRatings(
    supabase,
    startsAt,
    data.map((row) => row.user_id),
  );
  if (ratingFailed) return { assignments: [], failed: true };

  // Sign-up position drives the deterministic tie-break, same as generation.
  const { entries, failed: rosterFailed } = await loadRoster(trainingId, headers, cookies);
  if (rosterFailed) return { assignments: [], failed: true };
  const positionOf = new Map(entries.map((entry) => [entry.user_id, entry.position]));

  const assignments: AssignedPlayer[] = data.map((row) => ({
    user_id: row.user_id,
    nickname: row.profiles.nickname,
    position: positionOf.get(row.user_id) ?? 0,
    rating: ratingOf.get(row.user_id) ?? UNRATED_RATING,
    primaryPosition: row.profiles.primary_position,
    secondaryPosition: row.profiles.secondary_position,
    team: row.team,
    isSubstituteSetter: row.is_substitute_setter,
  }));

  // Team, then rating desc, then sign-up position: stable order for the two-column display.
  assignments.sort((a, b) => a.team.localeCompare(b.team) || b.rating - a.rating || a.position - b.position);
  return { assignments, failed: false };
}
