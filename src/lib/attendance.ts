// Attendance + no-show lockout rules shared by the organizer attendance island, its API route, the
// player page and the kitchen-sink. Browser-safe on purpose: no Supabase import, so the islands
// bundle no secrets (mirrors src/lib/ratings.ts).
import { t, type Lang } from "@/i18n";

// The lockout window and limit. Mirrored by the SQL in the attendance_and_lockout migration, which
// is authoritative; these exist for user-facing copy (the block reason) and any client-side checks.
export const ABSENCE_WINDOW = 8;
export const ABSENCE_LIMIT = 2;

export type AttendanceStatus = "present" | "absent";

export const ATTENDANCE_STATUSES = ["present", "absent"] as const satisfies readonly AttendanceStatus[];

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return value === "present" || value === "absent";
}

export type AttendanceErrorCode = "not_markable" | "not_on_main_list" | "invalid_request" | "not_found" | "save_failed";

const ERROR_KEYS = {
  not_markable: "notMarkable",
  not_on_main_list: "notOnMainList",
  invalid_request: "invalidRequest",
  not_found: "notFound",
  save_failed: "saveFailed",
} as const satisfies Record<AttendanceErrorCode, string>;

// Unknown codes get the generic message: the server's error code is never echoed back verbatim.
export function attendanceErrorMessage(code: string | null, lang: Lang): string | null {
  if (!code) return null;
  const key = code in ERROR_KEYS ? ERROR_KEYS[code as AttendanceErrorCode] : "saveFailed";
  return t(lang).organizer.attendance.errors[key];
}

// FR-010: the reason a blocked player sees on the sign-up page instead of the sign-up button. A late
// withdrawal counts the same as a no-show, so the copy says "absences", not "no-shows".
export function blockReason(absences: number, lang: Lang): string {
  return t(lang).signup.blockReason(absences, ABSENCE_WINDOW);
}
