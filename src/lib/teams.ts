// Team generation rules shared by the organizer teams island, its API route and the
// kitchen-sink. Browser-safe on purpose: no Supabase import, so the island bundles no
// secrets (mirrors src/lib/ratings.ts vs src/lib/team-queries.ts). The server seam feeds
// this a ready TeamPlayer[] whose `rating` is the AVERAGE of the player's PAST-training
// ratings -- the upcoming training's own ratings are never used (they don't exist yet and
// must not feed its own split), and a player with no past rating is UNRATED_RATING (0). The
// algorithm here is pure and deterministic -- no I/O, no "no rating" branch.

import type { PlayerPosition } from "@/lib/profiles";

export type TeamId = "A" | "B";

export const TEAM_IDS = ["A", "B"] as const satisfies readonly TeamId[];

export const TEAM_LABELS: Record<TeamId, string> = {
  A: "Team A",
  B: "Team B",
};

// Teams are balanced on AVERAGE rating, not sum: with an odd roster (e.g. 6 vs 5) the
// larger team always carries a higher sum, so a sum threshold would almost always refuse.
// The average is size-independent. 0.5 of slack on the rating scale.
export const TEAM_AVG_DIFF_MAX = 0.5;

// A player with no past-training rating counts as 0 for generation (an unrated newcomer is the
// lowest, not a middle). Distinct from RATING_DEFAULT (5), which is the rating UI's seed value.
export const UNRATED_RATING = 0;

// Float guard: averages of half-step ratings can drift a hair; compare with an epsilon.
const EPSILON = 1e-9;

export interface TeamPlayer {
  user_id: string;
  nickname: string;
  // Sign-up queue position: the deterministic tie-breaker whenever ratings are equal.
  position: number;
  rating: number;
  primaryPosition: PlayerPosition | null;
  secondaryPosition: PlayerPosition | null;
}

export interface AssignedPlayer extends TeamPlayer {
  team: TeamId;
  // True only when this player was picked as a fallback setter (FR-018) because the team
  // had no real setter. Recorded for this training only, never written back to the profile.
  isSubstituteSetter: boolean;
}

export type GenerateResult =
  | { ok: true; players: AssignedPlayer[]; averages: Record<TeamId, number>; avgDiff: number }
  | { ok: false; code: "threshold_unmet"; exceededBy: number };

// A player is a setter if either declared position is 'setter' -- FR-018 reads the pair.
export function isSetter(player: Pick<TeamPlayer, "primaryPosition" | "secondaryPosition">): boolean {
  return player.primaryPosition === "setter" || player.secondaryPosition === "setter";
}

// Court role for positional balancing is the player's PRIMARY position -- what they'd play on
// court. A player with no declared primary is "flex" and floats freely to even out sizes.
type Role = PlayerPosition | "flex";

// Deterministic role ordering for the seed draft; also the order a full six lines up in.
const ROLE_ORDER: readonly Role[] = ["setter", "opposite", "outside", "middle", "libero", "flex"];

function roleOf(player: TeamPlayer): Role {
  return player.primaryPosition ?? "flex";
}

function roleRank(role: Role): number {
  return ROLE_ORDER.indexOf(role);
}

// Serpentine pick: A,B, B,A, A,B, ... Each pair of picks flips direction, which keeps the sizes
// within one and -- because the seed is grouped by role -- splits each position evenly across
// the two teams before any refinement (so neither side ends up with, say, both middles).
function snakeTeam(index: number): TeamId {
  const forwardPair = Math.floor(index / 2) % 2 === 0;
  const firstOfPair = index % 2 === 0;
  return forwardPair === firstOfPair ? "A" : "B";
}

function teamMembers(players: AssignedPlayer[], team: TeamId): AssignedPlayer[] {
  return players.filter((player) => player.team === team);
}

function average(members: AssignedPlayer[]): number {
  if (members.length === 0) return 0;
  return members.reduce((sum, player) => sum + player.rating, 0) / members.length;
}

function avgDiffOf(players: AssignedPlayer[]): number {
  return Math.abs(average(teamMembers(players, "A")) - average(teamMembers(players, "B")));
}

// Soft positional objective (FR-018 extension): how unevenly the court roles are split between
// the teams, summed per role. 0 means every position is shared equally. Lower is better; it is
// a secondary goal that never causes a refusal -- only the rating threshold does.
function positionImbalance(players: AssignedPlayer[]): number {
  const counts = new Map<Role, { A: number; B: number }>();
  for (const player of players) {
    const role = roleOf(player);
    const entry = counts.get(role) ?? { A: 0, B: 0 };
    entry[player.team] += 1;
    counts.set(role, entry);
  }
  let total = 0;
  for (const entry of counts.values()) total += Math.abs(entry.A - entry.B);
  return total;
}

function teamHasSetter(players: AssignedPlayer[], team: TeamId): boolean {
  return players.some((player) => player.team === team && isSetter(player));
}

// Highest rating wins; sign-up position breaks ties. Operates on shared object references,
// so the caller's mutation of the returned player lands on the real assignment.
function highestRated(members: AssignedPlayer[]): AssignedPlayer | undefined {
  return [...members].sort((a, b) => b.rating - a.rating || a.position - b.position)[0];
}

// FR-018: when there are >= 2 real setters, give each team one by swapping, so neither needs
// a substitute. Only reachable with a surplus setter on the rich team; sizes are preserved
// (one-for-one swap). The lowest-rated surplus setter moves out, swapped with the poor team's
// non-setter whose rating is closest (smallest average disruption). Deterministic tie-breaks.
function ensureSetterEachTeam(players: AssignedPlayer[]): void {
  for (const poorTeam of TEAM_IDS) {
    if (teamHasSetter(players, poorTeam)) continue;
    const richTeam: TeamId = poorTeam === "A" ? "B" : "A";
    const richSetters = teamMembers(players, richTeam).filter((player) => isSetter(player));
    if (richSetters.length < 2) continue; // can't spare one -- a substitute covers it later

    const setterOut = [...richSetters].sort((a, b) => a.rating - b.rating || a.position - b.position)[0];
    const candidates = teamMembers(players, poorTeam).filter((player) => !isSetter(player));
    if (candidates.length === 0) continue;
    const playerIn = [...candidates].sort(
      (a, b) =>
        Math.abs(a.rating - setterOut.rating) - Math.abs(b.rating - setterOut.rating) || a.position - b.position,
    )[0];

    setterOut.team = poorTeam;
    playerIn.team = richTeam;
  }
}

// Reduce the average gap with the best legal pairwise swap until it is within threshold or no
// improving swap remains. Iteration order is fixed (by sign-up position); a candidate replaces
// the best only when strictly better on rating, with positional imbalance as the tie-break, so
// the first minimal swap wins -- deterministic. With >= 2 setters a swap may not strip a team of
// its last real setter. Bounded: every applied swap strictly shrinks the gap; rosters are <= 12.
function refineBalance(players: AssignedPlayer[], preserveSetters: boolean): void {
  for (;;) {
    const current = avgDiffOf(players);
    if (current <= TEAM_AVG_DIFF_MAX + EPSILON) return;

    const teamA = teamMembers(players, "A").sort((a, b) => a.position - b.position);
    const teamB = teamMembers(players, "B").sort((a, b) => a.position - b.position);
    let best: { a: AssignedPlayer; b: AssignedPlayer; diff: number; imbalance: number } | null = null;

    for (const a of teamA) {
      for (const b of teamB) {
        a.team = "B";
        b.team = "A";
        const legal = !preserveSetters || (teamHasSetter(players, "A") && teamHasSetter(players, "B"));
        const diff = avgDiffOf(players);
        const imbalance = positionImbalance(players);
        a.team = "A";
        b.team = "B";

        if (!legal || diff >= current - EPSILON) continue;
        const better =
          best === null ||
          diff < best.diff - EPSILON ||
          (Math.abs(diff - best.diff) <= EPSILON && imbalance < best.imbalance);
        if (better) best = { a, b, diff, imbalance };
      }
    }

    if (best === null) return; // no improving legal swap
    best.a.team = "B";
    best.b.team = "A";
  }
}

// Secondary pass (soft positions): once rating is within threshold, even out the court roles with
// swaps that keep the average gap within threshold and keep each team's setter. Picks the swap
// that most reduces positional imbalance; smaller resulting rating gap breaks ties. Deterministic
// and bounded: every applied swap strictly reduces imbalance.
function refinePositions(players: AssignedPlayer[], preserveSetters: boolean): void {
  for (;;) {
    const current = positionImbalance(players);
    if (current === 0) return;

    const teamA = teamMembers(players, "A").sort((a, b) => a.position - b.position);
    const teamB = teamMembers(players, "B").sort((a, b) => a.position - b.position);
    let best: { a: AssignedPlayer; b: AssignedPlayer; imbalance: number; diff: number } | null = null;

    for (const a of teamA) {
      for (const b of teamB) {
        if (roleOf(a) === roleOf(b)) continue; // same role: swapping changes no composition
        a.team = "B";
        b.team = "A";
        const diff = avgDiffOf(players);
        const legal =
          diff <= TEAM_AVG_DIFF_MAX + EPSILON &&
          (!preserveSetters || (teamHasSetter(players, "A") && teamHasSetter(players, "B")));
        const imbalance = positionImbalance(players);
        a.team = "A";
        b.team = "B";

        if (!legal || imbalance >= current) continue;
        const better =
          best === null || imbalance < best.imbalance || (imbalance === best.imbalance && diff < best.diff - EPSILON);
        if (better) best = { a, b, imbalance, diff };
      }
    }

    if (best === null) return; // no rating-safe swap improves the composition
    best.a.team = "B";
    best.b.team = "A";
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// Split a confirmed training's roster into two teams (FR-017/FR-018/FR-020), balanced on average
// rating and -- as a soft secondary goal -- on court positions (so each side resembles a real
// line-up: a setter, an opposite, two outside hitters, two middles when the roster allows).
// Deterministic: the same players + ratings + positions always produce the same split. Refuses
// ONLY when the closest reachable split still exceeds the average-rating threshold; positions
// never cause a refusal.
export function generateTeams(input: TeamPlayer[]): GenerateResult {
  // 1. Seed grouped by role (then rating desc, then sign-up position): the serpentine draft over
  //    this order splits every position evenly and keeps the rating sums close.
  const ordered = [...input].sort(
    (a, b) => roleRank(roleOf(a)) - roleRank(roleOf(b)) || b.rating - a.rating || a.position - b.position,
  );
  const assigned: AssignedPlayer[] = ordered.map((player, index) => ({
    ...player,
    team: snakeTeam(index),
    isSubstituteSetter: false,
  }));

  const setterCount = assigned.filter((player) => isSetter(player)).length;

  // 2. Distribute real setters when there are enough to give each team one.
  if (setterCount >= 2) ensureSetterEachTeam(assigned);

  // 3. Balance rating within threshold (keeping each team's real setter when >= 2 exist).
  refineBalance(assigned, setterCount >= 2);

  // 4. Even out positions without pushing the rating gap back over threshold (soft goal).
  refinePositions(assigned, setterCount >= 2);

  // 5. Substitute setters last, so refinement can't invalidate the pick: any team still without
  //    a real setter flags its highest-rated player (FR-018).
  for (const team of TEAM_IDS) {
    const members = teamMembers(assigned, team);
    if (members.some((player) => isSetter(player))) continue;
    const substitute = highestRated(members);
    if (substitute) substitute.isSubstituteSetter = true;
  }

  const diff = avgDiffOf(assigned);
  if (diff > TEAM_AVG_DIFF_MAX + EPSILON) {
    return { ok: false, code: "threshold_unmet", exceededBy: round1(diff - TEAM_AVG_DIFF_MAX) };
  }

  return {
    ok: true,
    players: assigned,
    averages: {
      A: round1(average(teamMembers(assigned, "A"))),
      B: round1(average(teamMembers(assigned, "B"))),
    },
    avgDiff: round1(diff),
  };
}

export type TeamsErrorCode = "threshold_unmet" | "not_generatable" | "invalid_request" | "not_found" | "save_failed";

const MESSAGES: Record<TeamsErrorCode, string> = {
  threshold_unmet: `Couldn't balance the teams within the ${TEAM_AVG_DIFF_MAX} average-rating limit`,
  not_generatable: "Teams can be generated only once the training is confirmed",
  invalid_request: "Something went wrong. Please try again.",
  not_found: "That training no longer exists",
  save_failed: "Could not save the teams. Please try again.",
};

// Unknown codes get the generic message: the server's error code is never echoed back verbatim.
// threshold_unmet embeds the exceedance (FR-020: state by how much) when it is known.
export function teamsErrorMessage(code: string | null, exceededBy?: number): string | null {
  if (!code) return null;
  if (code === "threshold_unmet" && typeof exceededBy === "number") {
    return `Couldn't balance the teams: the closest split still exceeds the ${TEAM_AVG_DIFF_MAX} average-rating limit by ${exceededBy}.`;
  }
  return code in MESSAGES ? MESSAGES[code as TeamsErrorCode] : MESSAGES.save_failed;
}
