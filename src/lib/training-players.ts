// Row model for the organizer's merged players table (one row per player in the group, with the
// training bucket, attendance mark and rating). Browser-safe on purpose: no Supabase import, so the
// table island bundles no secrets (mirrors src/lib/roster-status.ts).

import type { AttendanceStatus } from "@/lib/attendance";
import { rosterLabel } from "@/lib/profiles";
import type { RosterStatus } from "@/lib/roster-status";

export type PlayerBucket = "main" | "waitlist" | "blocked" | "noResponse";

export interface PlayerRow {
  userId: string;
  label: string;
  bucket: PlayerBucket;
  // 1-based queue number for main list and waitlist; null for the buckets without a queue.
  rank: number | null;
  // Main-list rows only: null means unmarked / no rating row. Other buckets are always null.
  attendance: AttendanceStatus | null;
  rating: number | null;
}

// Each bucket is a word, not only a colour; the variants are existing badge status token pairs.
export const PLAYER_BUCKET_BADGE: Record<
  PlayerBucket,
  { label: string; variant: "success" | "info" | "destructive" | "secondary" }
> = {
  main: { label: "Signed up", variant: "success" },
  waitlist: { label: "Waitlist", variant: "info" },
  blocked: { label: "Blocked", variant: "destructive" },
  noResponse: { label: "No response", variant: "secondary" },
};

// Order: main (queue order), waitlist (queue order), then blocked and no response (already sorted by
// nickname in rosterStatus()). Attendance and rating only apply to the main list: it is the only
// group that played.
export function buildPlayerRows(
  status: RosterStatus,
  marks: ReadonlyMap<string, AttendanceStatus>,
  ratings: ReadonlyMap<string, number>,
): PlayerRow[] {
  const queued = (bucket: "main" | "waitlist") =>
    status[bucket].map((entry, index): PlayerRow => ({
      userId: entry.user_id,
      label: rosterLabel(entry),
      bucket,
      rank: index + 1,
      attendance: bucket === "main" ? (marks.get(entry.user_id) ?? null) : null,
      rating: bucket === "main" ? (ratings.get(entry.user_id) ?? null) : null,
    }));
  const unqueued = (bucket: "blocked" | "noResponse") =>
    status[bucket].map((player): PlayerRow => ({
      userId: player.user_id,
      label: rosterLabel(player),
      bucket,
      rank: null,
      attendance: null,
      rating: null,
    }));

  return [...queued("main"), ...queued("waitlist"), ...unqueued("blocked"), ...unqueued("noResponse")];
}
