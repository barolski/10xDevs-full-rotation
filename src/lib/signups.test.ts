import { describe, expect, it } from "vitest";
import {
  freeMainSlots,
  mapSignupDbError,
  MAIN_LIST_SIZE,
  placementOf,
  splitRoster,
  type SignupEntry,
} from "@/lib/signups";

function entry(position: number): SignupEntry {
  return { id: `s${String(position)}`, user_id: `u${String(position)}`, position, nickname: `p${String(position)}` };
}

function entries(count: number): SignupEntry[] {
  return Array.from({ length: count }, (_, i) => entry(i + 1));
}

describe("splitRoster", () => {
  it("puts the first MAIN_LIST_SIZE entries by position on the main list and the rest on the waitlist", () => {
    const roster = splitRoster(entries(MAIN_LIST_SIZE + 1).reverse());

    expect(roster.main.map((e) => e.position)).toEqual(Array.from({ length: MAIN_LIST_SIZE }, (_, i) => i + 1));
    expect(roster.waitlist.map((e) => e.position)).toEqual([MAIN_LIST_SIZE + 1]);
  });

  it.each([
    [0, 0, 0],
    [MAIN_LIST_SIZE - 1, MAIN_LIST_SIZE - 1, 0],
    [MAIN_LIST_SIZE, MAIN_LIST_SIZE, 0],
    [MAIN_LIST_SIZE + 1, MAIN_LIST_SIZE, 1],
  ])("splits %i sign-ups into %i main and %i waitlist", (total, main, waitlist) => {
    const roster = splitRoster(entries(total));

    expect(roster.main).toHaveLength(main);
    expect(roster.waitlist).toHaveLength(waitlist);
  });

  it("orders by the stored queue position, not by array order or gaps in the numbering", () => {
    const roster = splitRoster([entry(30), entry(7), entry(19)]);

    expect(roster.main.map((e) => e.position)).toEqual([7, 19, 30]);
  });
});

describe("placementOf", () => {
  const roster = splitRoster(entries(MAIN_LIST_SIZE + 2));

  it("reports main-list rank and the stored position", () => {
    expect(placementOf(roster, "u3")).toEqual({ list: "main", rank: 3, position: 3 });
  });

  it("reports a 1-based waitlist rank that restarts after the main list", () => {
    expect(placementOf(roster, `u${String(MAIN_LIST_SIZE + 2)}`)).toEqual({
      list: "waitlist",
      rank: 2,
      position: MAIN_LIST_SIZE + 2,
    });
  });

  it("returns null for an unknown or missing user", () => {
    expect(placementOf(roster, "nobody")).toBeNull();
    expect(placementOf(roster, undefined)).toBeNull();
  });
});

describe("freeMainSlots", () => {
  it("is the number of vacant main-list spots and never negative", () => {
    expect(freeMainSlots(splitRoster(entries(0)))).toBe(MAIN_LIST_SIZE);
    expect(freeMainSlots(splitRoster(entries(MAIN_LIST_SIZE - 1)))).toBe(1);
    expect(freeMainSlots(splitRoster(entries(MAIN_LIST_SIZE + 5)))).toBe(0);
  });
});

describe("mapSignupDbError", () => {
  it("maps the one-active-per-player index violation to already_signed_up", () => {
    expect(
      mapSignupDbError({ message: "duplicate key", code: "23505", details: "signups_one_active_per_player_idx" }),
    ).toBe("already_signed_up");
  });

  it("does not report any other unique violation as a user error", () => {
    expect(mapSignupDbError({ message: "duplicate key value violates signups_position_idx", code: "23505" })).toBe(
      "save_failed",
    );
  });

  it.each([
    ["signup_closed", "signup_closed"],
    ["overlapping_signup", "overlapping_signup"],
    ["player_blocked", "player_blocked"],
    ["training_not_found", "not_found"],
  ] as const)("maps an exception message containing %s to %s", (fragment, code) => {
    expect(mapSignupDbError({ message: `ERROR: ${fragment}` })).toBe(code);
  });

  it("falls back to save_failed for anything unrecognised", () => {
    expect(mapSignupDbError({ message: "boom" })).toBe("save_failed");
  });
});
