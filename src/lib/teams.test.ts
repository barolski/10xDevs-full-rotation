import { describe, expect, it } from "vitest";
import { formatNumber } from "@/i18n";
import type { PlayerPosition } from "@/lib/profiles";
import {
  generateTeams,
  isSetter,
  TEAM_AVG_DIFF_MAX,
  teamsImbalanceWarning,
  UNRATED_RATING,
  type AssignedPlayer,
  type TeamId,
  type TeamPlayer,
} from "@/lib/teams";

type Spec = [rating: number, primary: PlayerPosition | null, secondary?: PlayerPosition | null];

// Sign-up position is the 1-based index, so a roster spec is also the sign-up order.
function roster(specs: Spec[]): TeamPlayer[] {
  return specs.map(([rating, primary, secondary], index) => ({
    user_id: `u${String(index + 1)}`,
    nickname: `player${String(index + 1)}`,
    position: index + 1,
    rating,
    primaryPosition: primary,
    secondaryPosition: secondary ?? null,
  }));
}

const ROSTERS: Record<string, TeamPlayer[]> = {
  "full six-a-side with two setters": roster([
    [8, "setter"],
    [7, "setter"],
    [9, "opposite"],
    [6, "opposite"],
    [8.5, "outside"],
    [7, "outside"],
    [5, "outside"],
    [6.5, "middle"],
    [7.5, "middle"],
    [4, "middle"],
    [6, "libero"],
    [5.5, "libero"],
  ]),
  "odd roster with three setters": roster([
    [9, "setter"],
    [8, "setter"],
    [3, "setter"],
    [7, "outside"],
    [6, "outside"],
    [5, "middle"],
    [4, "middle"],
    [8, "opposite"],
    [2, "libero"],
    [6, "outside"],
    [7, "middle"],
  ]),
  "no setters at all": roster([
    [8, "outside"],
    [7, "outside"],
    [6, "middle"],
    [5, "middle"],
    [9, "opposite"],
    [4, "libero"],
    [6, "outside"],
    [7, "middle"],
    [5, "opposite"],
    [3, "libero"],
  ]),
  "a single setter": roster([
    [9, "setter"],
    [8, "outside"],
    [7, "outside"],
    [6, "middle"],
    [5, "middle"],
    [4, "opposite"],
    [6, "libero"],
    [7, "outside"],
  ]),
  "setter only as secondary position": roster([
    [8, "outside", "setter"],
    [7, "outside"],
    [6, "middle", "setter"],
    [5, "middle"],
    [9, "opposite"],
    [4, "libero"],
  ]),
  "everyone unrated": roster(Array.from({ length: 10 }, (): Spec => [UNRATED_RATING, "outside"])),
  "no declared positions (all flex)": roster([
    [9, null],
    [8, null],
    [7, null],
    [3, null],
    [2, null],
    [1, null],
  ]),
  "one ringer nobody can offset": roster([
    [10, "outside"],
    [1, "outside"],
    [1, "middle"],
    [1, "middle"],
    [1, "opposite"],
    [1, "libero"],
    [1, "outside"],
    [1, "middle"],
  ]),
  "two players": roster([
    [7, "setter"],
    [3, "outside"],
  ]),
  "one player": roster([[5, "outside"]]),
  "empty roster": [],
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function members(players: AssignedPlayer[], team: TeamId): AssignedPlayer[] {
  return players.filter((player) => player.team === team);
}

function meanRating(players: AssignedPlayer[]): number {
  if (players.length === 0) return 0;
  return players.reduce((sum, player) => sum + player.rating, 0) / players.length;
}

describe("generateTeams invariants", () => {
  describe.each(Object.entries(ROSTERS))("%s", (_name, input) => {
    it("assigns every player to exactly one team and keeps the sizes within one", () => {
      const { players } = generateTeams(input);

      expect(players.map((player) => player.user_id).sort()).toEqual(input.map((player) => player.user_id).sort());
      expect(Math.abs(members(players, "A").length - members(players, "B").length)).toBeLessThanOrEqual(1);
    });

    it("gives each team a real setter when there are enough, otherwise flags exactly one substitute per setterless team", () => {
      const { players } = generateTeams(input);
      const realSetters = players.filter((player) => isSetter(player)).length;

      for (const team of ["A", "B"] as const) {
        const side = members(players, team);
        const hasSetter = side.some((player) => isSetter(player));
        const substitutes = side.filter((player) => player.isSubstituteSetter);

        if (realSetters >= 2) expect(hasSetter).toBe(true);
        if (hasSetter) expect(substitutes).toHaveLength(0);
        else expect(substitutes).toHaveLength(side.length > 0 ? 1 : 0);
      }
    });

    it("reports averages and the target flag that match the returned assignment", () => {
      const result = generateTeams(input);
      const meanA = meanRating(members(result.players, "A"));
      const meanB = meanRating(members(result.players, "B"));
      const gap = Math.abs(meanA - meanB);

      expect(result.averages).toEqual({ A: round1(meanA), B: round1(meanB) });
      expect(result.avgDiff).toBe(round1(gap));
      expect(result.balanced).toBe(gap <= TEAM_AVG_DIFF_MAX + 1e-9);
      expect(result.exceededBy).toBe(result.balanced ? 0 : round1(gap - TEAM_AVG_DIFF_MAX));
    });

    it("is deterministic, independent of input order, and leaves the input untouched", () => {
      const before = structuredClone(input);

      const first = generateTeams(input);
      const second = generateTeams(input);
      const reversed = generateTeams([...input].reverse());

      expect(input).toEqual(before);
      expect(second).toEqual(first);
      const teamsById = (players: AssignedPlayer[]) => new Map(players.map((player) => [player.user_id, player.team]));
      expect(teamsById(reversed.players)).toEqual(teamsById(first.players));
    });
  });

  it("never refuses: a roster that cannot hit the target still returns a split, flagged as unbalanced", () => {
    const result = generateTeams(ROSTERS["one ringer nobody can offset"]);

    expect(result.players).toHaveLength(8);
    expect(result.balanced).toBe(false);
    expect(result.exceededBy).toBeGreaterThan(0);
  });

  it("meets the target on a roster that can be balanced", () => {
    const result = generateTeams(ROSTERS["full six-a-side with two setters"]);

    expect(result.balanced).toBe(true);
    expect(result.exceededBy).toBe(0);
    expect(result.avgDiff).toBeLessThanOrEqual(TEAM_AVG_DIFF_MAX);
  });

  it("counts an unrated player as the lowest rating, not a middle one", () => {
    const result = generateTeams(
      roster([
        [UNRATED_RATING, "outside"],
        [UNRATED_RATING, "outside"],
        [UNRATED_RATING, "middle"],
        [UNRATED_RATING, "middle"],
      ]),
    );

    expect(result.averages).toEqual({ A: 0, B: 0 });
    expect(result.balanced).toBe(true);
  });
});

describe("teamsImbalanceWarning", () => {
  it("returns null when the target was met", () => {
    expect(teamsImbalanceWarning(0, "en")).toBeNull();
    expect(teamsImbalanceWarning(-0.5, "pl")).toBeNull();
  });

  it("states by how much the target was exceeded, in both languages", () => {
    expect(teamsImbalanceWarning(1.5, "en")).toContain("1.5");
    expect(teamsImbalanceWarning(1.5, "pl")).toContain(formatNumber("pl", 1.5));
  });
});
