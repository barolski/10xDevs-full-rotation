import { describe, expect, it } from "vitest";
import { MAIN_LIST_SIZE, splitRoster, type SignupEntry } from "@/lib/signups";

function entry(position: number): SignupEntry {
  return { id: `s${String(position)}`, user_id: `u${String(position)}`, position, nickname: `p${String(position)}` };
}

describe("splitRoster", () => {
  it("puts the first MAIN_LIST_SIZE entries by position on the main list and the rest on the waitlist", () => {
    const entries = Array.from({ length: MAIN_LIST_SIZE + 1 }, (_, i) => entry(i + 1)).reverse();

    const roster = splitRoster(entries);

    expect(roster.main.map((e) => e.position)).toEqual(Array.from({ length: MAIN_LIST_SIZE }, (_, i) => i + 1));
    expect(roster.waitlist.map((e) => e.position)).toEqual([MAIN_LIST_SIZE + 1]);
  });
});
