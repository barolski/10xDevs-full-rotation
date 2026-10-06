// Profile rules shared by the profile form island and the API route.
// Browser-safe (no Supabase import); server-only reads live in src/lib/signup-queries.ts.
import { t, type Lang } from "@/i18n";

export const NICKNAME_MAX = 40;

// setter / outside / opposite / middle / libero — mirrors the player_position enum in the
// profiles migration.
export type PlayerPosition = "setter" | "outside" | "opposite" | "middle" | "libero";

// Enum order, used to build the dropdowns. Keep in sync with the player_position enum.
export const PLAYER_POSITIONS = [
  "setter",
  "outside",
  "opposite",
  "middle",
  "libero",
] as const satisfies readonly PlayerPosition[];

// The position's name in the UI language (the dictionary's `positions` section).
export function positionLabel(position: PlayerPosition, lang: Lang): string {
  return t(lang).positions[position];
}

function isPlayerPosition(value: string): value is PlayerPosition {
  return (PLAYER_POSITIONS as readonly string[]).includes(value);
}

export interface Profile {
  user_id: string;
  nickname: string;
  first_name: string | null;
  last_name: string | null;
  primary_position: PlayerPosition | null;
  secondary_position: PlayerPosition | null;
}

export const PROFILE_COLUMNS = "user_id, nickname, first_name, last_name, primary_position, secondary_position";

export type ProfileErrorCode =
  | "missing_nickname"
  | "nickname_too_long"
  | "invalid_position"
  | "secondary_without_primary"
  | "secondary_equals_primary"
  | "not_found"
  | "save_failed";

export type NicknameValidation =
  | { ok: true; value: string }
  | { ok: false; code: Extract<ProfileErrorCode, "missing_nickname" | "nickname_too_long"> };

export function validateNickname(raw: string): NicknameValidation {
  const nickname = raw.trim();
  if (!nickname) return { ok: false, code: "missing_nickname" };
  if (nickname.length > NICKNAME_MAX) return { ok: false, code: "nickname_too_long" };
  return { ok: true, value: nickname };
}

export type PositionsValidation =
  | { ok: true; primary: PlayerPosition | null; secondary: PlayerPosition | null }
  | {
      ok: false;
      code: Extract<ProfileErrorCode, "invalid_position" | "secondary_without_primary" | "secondary_equals_primary">;
    };

// Mirrors the DB constraints so the client and API reject the same combinations the migration
// would: an empty select is null, a secondary requires a primary (profiles_primary_required),
// and the two must differ (profiles_positions_differ).
export function validatePositions(raw: { primary: string; secondary: string }): PositionsValidation {
  const parse = (value: string): PlayerPosition | null | "invalid" => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return isPlayerPosition(trimmed) ? trimmed : "invalid";
  };

  const primary = parse(raw.primary);
  const secondary = parse(raw.secondary);
  if (primary === "invalid" || secondary === "invalid") return { ok: false, code: "invalid_position" };
  if (secondary && !primary) return { ok: false, code: "secondary_without_primary" };
  if (primary && secondary && primary === secondary) return { ok: false, code: "secondary_equals_primary" };
  return { ok: true, primary, secondary };
}

const ERROR_KEYS = {
  missing_nickname: "missingNickname",
  nickname_too_long: "nicknameTooLong",
  invalid_position: "invalidPosition",
  secondary_without_primary: "secondaryWithoutPrimary",
  secondary_equals_primary: "secondaryEqualsPrimary",
  not_found: "notFound",
  save_failed: "saveFailed",
} as const satisfies Record<ProfileErrorCode, string>;

// Unknown codes get the generic save-failed message: the server's error code is never echoed back verbatim.
export function profileErrorMessage(code: string | null, lang: Lang): string | null {
  if (!code) return null;
  const errors = t(lang).profile.errors;
  const key = code in ERROR_KEYS ? ERROR_KEYS[code as ProfileErrorCode] : "saveFailed";
  return key === "nicknameTooLong" ? errors.nicknameTooLong(NICKNAME_MAX) : errors[key];
}

// The single place that decides what a roster calls someone. The positions-and-ratings slice
// extends this with the real name; every view follows without changing.
export function rosterLabel(entry: { nickname: string }): string {
  return entry.nickname;
}
