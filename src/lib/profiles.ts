// Profile rules shared by the profile form island and the API route.
// Browser-safe (no Supabase import); server-only reads live in src/lib/signup-queries.ts.

export const NICKNAME_MAX = 40;

// setter / outside / opposite / middle / libero — mirrors the player_position enum in the
// profiles migration. Unused until the positions-and-ratings slice fills the screens.
export type PlayerPosition = "setter" | "outside" | "opposite" | "middle" | "libero";

export interface Profile {
  user_id: string;
  nickname: string;
  first_name: string | null;
  last_name: string | null;
  primary_position: PlayerPosition | null;
  secondary_position: PlayerPosition | null;
}

export const PROFILE_COLUMNS = "user_id, nickname, first_name, last_name, primary_position, secondary_position";

export type ProfileErrorCode = "missing_nickname" | "nickname_too_long" | "not_found" | "save_failed";

export type NicknameValidation =
  | { ok: true; value: string }
  | { ok: false; code: Extract<ProfileErrorCode, "missing_nickname" | "nickname_too_long"> };

export function validateNickname(raw: string): NicknameValidation {
  const nickname = raw.trim();
  if (!nickname) return { ok: false, code: "missing_nickname" };
  if (nickname.length > NICKNAME_MAX) return { ok: false, code: "nickname_too_long" };
  return { ok: true, value: nickname };
}

const MESSAGES: Record<ProfileErrorCode, string> = {
  missing_nickname: "Name is required",
  nickname_too_long: `Name can be at most ${NICKNAME_MAX} characters`,
  not_found: "Profile not found",
  save_failed: "Could not save your profile. Please try again.",
};

export function profileErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return code in MESSAGES ? MESSAGES[code as ProfileErrorCode] : MESSAGES.save_failed;
}

// The single place that decides what a roster calls someone. The positions-and-ratings slice
// extends this with the real name; every view follows without changing.
export function rosterLabel(entry: { nickname: string }): string {
  return entry.nickname;
}
