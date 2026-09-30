// Rating rules shared by the organizer rating island and its API route.
// Browser-safe on purpose: no Supabase import, so the island bundles no secrets
// (mirrors src/lib/signups.ts vs src/lib/signup-queries.ts).

// numeric(3,1) in the training_ratings migration, 1.0-10.0. An unrated player is
// treated as RATING_DEFAULT rather than a missing value, so S-06 never handles "no rating".
export const RATING_MIN = 1;
export const RATING_MAX = 10;
export const RATING_STEP = 0.5;
export const RATING_DEFAULT = 5;

export type RatingErrorCode =
  "invalid_rating" | "invalid_request" | "not_ratable" | "not_on_main_list" | "not_found" | "save_failed";

export type RatingValidation = { ok: true; value: number } | { ok: false; code: "invalid_rating" };

export function validateRating(raw: unknown): RatingValidation {
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
  if (raw === "" || !Number.isFinite(value)) return { ok: false, code: "invalid_rating" };
  if (value < RATING_MIN || value > RATING_MAX) return { ok: false, code: "invalid_rating" };
  // Half-point steps only; compare the doubled value to an integer to dodge float drift.
  if (!Number.isInteger(value * 2)) return { ok: false, code: "invalid_rating" };
  return { ok: true, value };
}

const MESSAGES: Record<RatingErrorCode, string> = {
  invalid_rating: `Rating must be ${RATING_MIN}-${RATING_MAX} in steps of ${RATING_STEP}`,
  invalid_request: "Something went wrong. Please try again.",
  not_ratable: "Ratings open only after the training has taken place",
  not_on_main_list: "Only main-list players can be rated",
  not_found: "That player or training no longer exists",
  save_failed: "Could not save the rating. Please try again.",
};

// Unknown codes get the generic message: the server's error code is never echoed back verbatim.
export function ratingErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return code in MESSAGES ? MESSAGES[code as RatingErrorCode] : MESSAGES.save_failed;
}
