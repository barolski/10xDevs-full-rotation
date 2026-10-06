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

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
};

export type AttendanceErrorCode = "not_markable" | "not_on_main_list" | "invalid_request" | "not_found" | "save_failed";

const MESSAGES: Record<AttendanceErrorCode, string> = {
  not_markable: "Attendance can be marked only after the training has taken place",
  not_on_main_list: "Only main-list players can be marked",
  invalid_request: "Something went wrong. Please try again.",
  not_found: "That player or training no longer exists",
  save_failed: "Could not save attendance. Please try again.",
};

// Unknown codes get the generic message: the server's error code is never echoed back verbatim.
export function attendanceErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return code in MESSAGES ? MESSAGES[code as AttendanceErrorCode] : MESSAGES.save_failed;
}

// FR-010: the reason a blocked player sees on the sign-up page instead of the sign-up button. A late
// withdrawal counts the same as a no-show, so the copy says "absences", not "no-shows".
export function blockReason(absences: number, lang: Lang): string {
  return t(lang).signup.blockReason(absences, ABSENCE_WINDOW);
}
