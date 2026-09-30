// Profile rules shared by the profile form island and the API route.
// Browser-safe (no Supabase import); server-only reads live in src/lib/signup-queries.ts.

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

export const POSITION_LABELS: Record<PlayerPosition, string> = {
  setter: "Setter",
  outside: "Outside hitter",
  opposite: "Opposite",
  middle: "Middle blocker",
  libero: "Libero",
};

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

const MESSAGES: Record<ProfileErrorCode, string> = {
  missing_nickname: "Name is required",
  nickname_too_long: `Name can be at most ${NICKNAME_MAX} characters`,
  invalid_position: "Pick a position from the list",
  secondary_without_primary: "Choose a primary position before a secondary one",
  secondary_equals_primary: "Secondary position must differ from primary",
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
