import { describe, expect, it } from "vitest";
import { rosterStatus, type RosterPoolEntry } from "@/lib/roster-status";
import { MAIN_LIST_SIZE, splitRoster, type SignupEntry } from "@/lib/signups";

function signup(userId: string, position: number): SignupEntry {
  return { id: `s-${userId}`, user_id: userId, position, nickname: userId };
}

function member(userId: string, nickname: string): RosterPoolEntry {
  return { user_id: userId, nickname };
}

describe("rosterStatus", () => {
  const pool = [member("a", "Ala"), member("b", "Bartek"), member("c", "Celina"), member("d", "Darek")];

  it("buckets players without an active sign-up into blocked or noResponse", () => {
    const status = rosterStatus([signup("a", 1)], pool, new Set(["b"]));

    expect(status.blocked.map((p) => p.user_id)).toEqual(["b"]);
    expect(status.noResponse.map((p) => p.user_id)).toEqual(["c", "d"]);
  });

  it("never lists a signed-up player as blocked or no-response, even when the blocked set contains them", () => {
    const status = rosterStatus([signup("a", 1), signup("b", 2)], pool, new Set(["a", "b"]));

    expect(status.blocked).toEqual([]);
    expect(status.noResponse.map((p) => p.user_id)).toEqual(["c", "d"]);
    expect(status.main.map((e) => e.user_id)).toEqual(["a", "b"]);
  });

  it("keeps main and waitlist identical to splitRoster", () => {
    const entries = Array.from({ length: MAIN_LIST_SIZE + 2 }, (_, i) => signup(`x${String(i)}`, i + 1));

    const status = rosterStatus(entries, [], new Set());
    const roster = splitRoster(entries);

    expect(status.main).toEqual(roster.main);
    expect(status.waitlist).toEqual(roster.waitlist);
  });

  it("sorts each bucket by nickname, ignoring case, with user_id as the tiebreak for equal nicknames", () => {
    const messy = [member("z2", "Kasia"), member("z1", "kasia"), member("m", "Adam")];

    const status = rosterStatus([], messy, new Set());

    expect(status.noResponse.map((p) => p.user_id)).toEqual(["m", "z1", "z2"]);
  });

  it("is stable when the pool arrives in a different order", () => {
    const forward = rosterStatus([], pool, new Set(["c"]));
    const backward = rosterStatus([], [...pool].reverse(), new Set(["c"]));

    expect(backward).toEqual(forward);
  });
});
