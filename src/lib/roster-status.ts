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
// by nickname so the view is stable across reloads.
export function rosterStatus(
  entries: SignupEntry[],
  pool: RosterPoolEntry[],
  blockedUserIds: ReadonlySet<string>,
): RosterStatus {
  const signedUp = new Set(entries.map((entry) => entry.user_id));
  const unsigned = pool.filter((player) => !signedUp.has(player.user_id));

  const byNickname = (a: RosterPoolEntry, b: RosterPoolEntry) =>
    a.nickname.localeCompare(b.nickname, undefined, { sensitivity: "base" });

  return {
    ...splitRoster(entries),
    blocked: unsigned.filter((player) => blockedUserIds.has(player.user_id)).sort(byNickname),
    noResponse: unsigned.filter((player) => !blockedUserIds.has(player.user_id)).sort(byNickname),
  };
}
