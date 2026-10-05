import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";
import type { AttendanceStatus } from "@/lib/attendance";

// Server-only (reads secrets through createClient): the attendance reads/writes for the organizer
// marking UI and its API route, mirroring src/lib/signup-queries.ts.

export interface AttendanceLoad {
  // Keyed by user_id; a player with no row is unmarked (absent from the map).
  marks: Map<string, AttendanceStatus>;
  failed: boolean;
}

export async function loadAttendance(
  trainingId: string,
  headers: Headers,
  cookies: AstroCookies,
): Promise<AttendanceLoad> {
  const supabase = createClient(headers, cookies);
  if (!supabase) return { marks: new Map(), failed: true };

  const { data, error } = await supabase
    .from("attendance")
    .select("user_id, status")
    .eq("training_id", trainingId)
    .overrideTypes<{ user_id: string; status: AttendanceStatus }[], { merge: false }>();

  if (error) return { marks: new Map(), failed: true };
  return { marks: new Map(data.map((row) => [row.user_id, row.status])), failed: false };
}

// Update-then-insert rather than upsert: PostgREST's ON CONFLICT DO UPDATE sets every column in the
// payload, including training_id/user_id, for which `authenticated` has only an INSERT grant (least
// privilege) — so an upsert is rejected 42501. The UPDATE path touches only `status`. Mirrors the
// ratings route.
export async function saveAttendance(
  trainingId: string,
  userId: string,
  status: AttendanceStatus,
  headers: Headers,
  cookies: AstroCookies,
): Promise<{ failed: boolean }> {
  const supabase = createClient(headers, cookies);
  if (!supabase) return { failed: true };

  const { data: updated, error: updateError } = await supabase
    .from("attendance")
    .update({ status })
    .eq("training_id", trainingId)
    .eq("user_id", userId)
    .select("user_id")
    .overrideTypes<{ user_id: string }[], { merge: false }>();
  if (updateError) return { failed: true };

  if (updated.length === 0) {
    const { error: insertError } = await supabase
      .from("attendance")
      .insert({ training_id: trainingId, user_id: userId, status });
    // A concurrent insert can win the race (unique PK, 23505); last-write-wins: retry as an update.
    if (insertError) {
      const { error: retryError } = await supabase
        .from("attendance")
        .update({ status })
        .eq("training_id", trainingId)
        .eq("user_id", userId);
      if (retryError) return { failed: true };
    }
  }

  return { failed: false };
}
