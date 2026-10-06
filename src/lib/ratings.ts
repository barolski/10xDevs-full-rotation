// Rating rules shared by the organizer rating island and its API route.
// Browser-safe on purpose: no Supabase import, so the island bundles no secrets
// (mirrors src/lib/signups.ts vs src/lib/signup-queries.ts).
import { t, type Lang } from "@/i18n";

// numeric(3,1) in the training_ratings migration, 1.0-10.0. An unrated player is
// treated as RATING_DEFAULT rather than a missing value, so S-06 never handles "no rating".
export const RATING_MIN = 1;
export const RATING_MAX = 10;
export const RATING_STEP = 0.5;
export const RATING_DEFAULT = 5;

export type RatingErrorCode =
  | "invalid_rating"
  | "invalid_request"
  | "not_ratable"
  | "not_on_main_list"
  | "player_absent"
  | "not_found"
  | "save_failed";

export type RatingValidation = { ok: true; value: number } | { ok: false; code: "invalid_rating" };

export function validateRating(raw: unknown): RatingValidation {
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
  if (raw === "" || !Number.isFinite(value)) return { ok: false, code: "invalid_rating" };
  if (value < RATING_MIN || value > RATING_MAX) return { ok: false, code: "invalid_rating" };
  // Half-point steps only; compare the doubled value to an integer to dodge float drift.
  if (!Number.isInteger(value * 2)) return { ok: false, code: "invalid_rating" };
  return { ok: true, value };
}

const ERROR_KEYS = {
  invalid_rating: "invalidRating",
  invalid_request: "invalidRequest",
  not_ratable: "notRatable",
  not_on_main_list: "notOnMainList",
  player_absent: "playerAbsent",
  not_found: "notFound",
  save_failed: "saveFailed",
} as const satisfies Record<RatingErrorCode, string>;

// Unknown codes get the generic message: the server's error code is never echoed back verbatim.
export function ratingErrorMessage(code: string | null, lang: Lang): string | null {
  if (!code) return null;
  const errors = t(lang).organizer.ratings.errors;
  const key = code in ERROR_KEYS ? ERROR_KEYS[code as RatingErrorCode] : "saveFailed";
  return key === "invalidRating" ? errors.invalidRating(RATING_MIN, RATING_MAX, RATING_STEP) : errors[key];
}
