// Roster status for the organizer view (FR-011): one training's players split into four disjoint
// buckets. Browser-safe on purpose: no Supabase import, so the islands that bundle it carry no
// secrets. The server-side loader lives in src/lib/signup-queries.ts.

import { splitRoster, type Roster, type SignupEntry } from "@/lib/signups";

// A group member as the organizer sees them: every profile, signed up for the training or not.
export interface RosterPoolEntry {
  user_id: string;
  nickname: string;
}

export interface RosterStatus extends Roster {
  // No active sign-up, and blocked by the no-show lockout (is_blocked for this training).
  blocked: RosterPoolEntry[];
  // No active sign-up, and not blocked. A withdrawn player lands here too: no active sign-up.
  noResponse: RosterPoolEntry[];
}

// The main list and waitlist come from splitRoster unchanged. Blocked and no-response only apply
// to players without an active sign-up: the lockout is enforced when a sign-up is inserted, so a
// signed-up player stays on their list even if the rule would now block them. Both lists are sorted
// by nickname, with user_id as the tiebreak, so the view is stable across reloads.
export function rosterStatus(
  entries: SignupEntry[],
  pool: RosterPoolEntry[],
  blockedUserIds: ReadonlySet<string>,
): RosterStatus {
  const signedUp = new Set(entries.map((entry) => entry.user_id));
  const unsigned = pool.filter((player) => !signedUp.has(player.user_id));

  // user_id breaks the tie: nicknames are not unique (no constraint on profiles.nickname, and the
  // profile trigger seeds it from the e-mail local part), and the pool read's row order is not
  // guaranteed, so without a tiebreak two players sharing a nickname can swap places between reloads.
  const byNickname = (a: RosterPoolEntry, b: RosterPoolEntry) =>
    a.nickname.localeCompare(b.nickname, undefined, { sensitivity: "base" }) || a.user_id.localeCompare(b.user_id);

  return {
    ...splitRoster(entries),
    blocked: unsigned.filter((player) => blockedUserIds.has(player.user_id)).sort(byNickname),
    noResponse: unsigned.filter((player) => !blockedUserIds.has(player.user_id)).sort(byNickname),
  };
}
