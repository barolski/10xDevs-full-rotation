// Sign-up rules shared by the API routes, the pages and (later) the close/confirm worker.
// Browser-safe on purpose: no Supabase import here, so the islands that bundle it carry no secrets.
// Server-only reads live in src/lib/signup-queries.ts, mirroring trainings.ts / training-queries.ts.

// The main list holds this many players; everyone after them is on the waitlist (FR-007).
// Mirrors the comment in the signups migration (supabase/migrations/*_signups.sql).
export const MAIN_LIST_SIZE = 12;

// A training confirms once its main list has at least this many players when sign-ups close
// (FR-013/FR-015); fewer and it is cancelled (FR-014). Mirrors the `>= 10` in
// public.close_due_trainings() (supabase/migrations/*_training_status.sql), which is authoritative.
export const MIN_CONFIRMED = 10;

// A player may not hold two active sign-ups for trainings starting less than this many minutes
// apart. Enforced by the signups trigger, which is the authoritative copy of this value.
export const OVERLAP_WINDOW_MINUTES = 120;

export interface SignupEntry {
  id: string;
  user_id: string;
  position: number;
  nickname: string;
}

export interface Roster {
  main: SignupEntry[];
  waitlist: SignupEntry[];
}

export interface Placement {
  list: "main" | "waitlist";
  // 1-based index within that list — what the player is told ("Waitlist, #2").
  rank: number;
  // The stored queue number, which never changes once assigned.
  position: number;
}

// Placement is derived, never stored: the first MAIN_LIST_SIZE active sign-ups by position are the
// main list. That is what makes a withdrawal before sign-ups close pull the next player up with no
// extra write.
export function splitRoster(entries: SignupEntry[]): Roster {
  const ordered = [...entries].sort((a, b) => a.position - b.position);
  return { main: ordered.slice(0, MAIN_LIST_SIZE), waitlist: ordered.slice(MAIN_LIST_SIZE) };
}

export function placementOf(roster: Roster, userId: string | undefined): Placement | null {
  if (!userId) return null;

  const mainIndex = roster.main.findIndex((entry) => entry.user_id === userId);
  if (mainIndex >= 0) {
    return { list: "main", rank: mainIndex + 1, position: roster.main[mainIndex].position };
  }

  const waitlistIndex = roster.waitlist.findIndex((entry) => entry.user_id === userId);
  if (waitlistIndex >= 0) {
    return { list: "waitlist", rank: waitlistIndex + 1, position: roster.waitlist[waitlistIndex].position };
  }

  return null;
}

export function freeMainSlots(roster: Roster): number {
  return Math.max(0, MAIN_LIST_SIZE - roster.main.length);
}

export type SignupErrorCode =
  | "signup_closed"
  | "already_signed_up"
  | "overlapping_signup"
  | "player_blocked"
  | "not_signed_up"
  | "not_found"
  | "save_failed";

const MESSAGES: Record<SignupErrorCode, string> = {
  signup_closed: "Sign-ups for this training are closed",
  already_signed_up: "You are already signed up for this training",
  overlapping_signup: `You are already signed up for another training starting within ${OVERLAP_WINDOW_MINUTES} minutes of this one`,
  player_blocked: "You can't sign up for this training",
  not_signed_up: "You are not signed up for this training",
  not_found: "Training not found",
  save_failed: "Something went wrong. Please try again.",
};

// Unknown codes get the generic message: the `?error=` value is never echoed back.
export function signupErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return code in MESSAGES ? MESSAGES[code as SignupErrorCode] : MESSAGES.save_failed;
}

// The signups triggers raise these as exception messages; a duplicate is caught by the partial
// unique index instead, which arrives as SQLSTATE 23505.
export function mapSignupDbError(error: { message: string; code?: string; details?: string | null }): SignupErrorCode {
  // Two indexes raise 23505: the one-active-per-player index, which really is the player being
  // already signed up, and the queue-position index, which can only mean an internal invariant broke.
  // Reporting the second as a user error is how a position bug hides behind a plausible message.
  if (error.code === "23505") {
    const target = `${error.message} ${error.details ?? ""}`;
    return target.includes("signups_one_active_per_player_idx") ? "already_signed_up" : "save_failed";
  }
  // `signup_immutable` has no code on purpose: the update grant covers only `status`, so no client can
  // reach it. If a future slice grants more columns, give it a code and copy rather than save_failed.
  if (error.message.includes("signup_closed")) return "signup_closed";
  if (error.message.includes("overlapping_signup")) return "overlapping_signup";
  if (error.message.includes("player_blocked")) return "player_blocked";
  if (error.message.includes("training_not_found")) return "not_found";
  return "save_failed";
}
