import { zonedLocalToUtc } from "@/lib/time";

// Sign-ups close this many hours before a training starts. Mirrors `interval '3 hours'` in the
// trainings migration (supabase/migrations/*_trainings.sql), which is the authoritative value.
export const SIGNUP_CLOSE_HOURS = 3;

export const TITLE_MAX = 80;
export const LOCATION_MAX = 120;
export const NOTE_MAX = 500;

export interface Training {
  id: string;
  title: string;
  starts_at: string;
  location: string;
  note: string | null;
}

export const TRAINING_COLUMNS = "id, title, starts_at, location, note";

export function signupClosesAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() - SIGNUP_CLOSE_HOURS * 60 * 60 * 1000);
}

export function isSignupOpen(startsAt: Date, now: Date): boolean {
  return signupClosesAt(startsAt).getTime() > now.getTime();
}

export type TrainingField = "title" | "starts_at" | "location" | "note";

export type TrainingErrorCode =
  | "missing_title"
  | "title_too_long"
  | "missing_location"
  | "location_too_long"
  | "note_too_long"
  | "invalid_start"
  | "starts_too_soon"
  | "signup_closed"
  | "not_found"
  | "save_failed";

export interface TrainingInput {
  title: string;
  startsAtLocal: string;
  location: string;
  note: string;
}

export interface TrainingValue {
  title: string;
  startsAt: Date;
  location: string;
  note: string | null;
}

export type TrainingValidation =
  | { ok: true; value: TrainingValue }
  | { ok: false; code: TrainingErrorCode; errors: Partial<Record<TrainingField, TrainingErrorCode>> };

// Shared by the API routes and the form island, so client and server apply the same rules.
export function validateTrainingInput(raw: TrainingInput, now: Date): TrainingValidation {
  const errors: Partial<Record<TrainingField, TrainingErrorCode>> = {};
  const title = raw.title.trim();
  const location = raw.location.trim();
  const note = raw.note.trim();

  if (!title) errors.title = "missing_title";
  else if (title.length > TITLE_MAX) errors.title = "title_too_long";

  const startsAt = zonedLocalToUtc(raw.startsAtLocal);
  if (!startsAt) errors.starts_at = "invalid_start";
  else if (!isSignupOpen(startsAt, now)) errors.starts_at = "starts_too_soon";

  if (!location) errors.location = "missing_location";
  else if (location.length > LOCATION_MAX) errors.location = "location_too_long";

  if (note.length > NOTE_MAX) errors.note = "note_too_long";

  // A missing startsAt always leaves errors.starts_at set, so `codes` is non-empty whenever this fails.
  const codes = Object.values(errors);
  if (!startsAt || codes.length > 0) {
    return { ok: false, code: codes[0], errors };
  }
  return { ok: true, value: { title, startsAt, location, note: note || null } };
}

export function trainingInputFromForm(form: FormData): TrainingInput {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  return { title: text("title"), startsAtLocal: text("starts_at"), location: text("location"), note: text("note") };
}

const MESSAGES: Record<TrainingErrorCode, string> = {
  missing_title: "Title is required",
  title_too_long: `Title can be at most ${TITLE_MAX} characters`,
  missing_location: "Location is required",
  location_too_long: `Location can be at most ${LOCATION_MAX} characters`,
  note_too_long: `Note can be at most ${NOTE_MAX} characters`,
  invalid_start: "Enter a valid start date and time",
  starts_too_soon: `The training must start more than ${SIGNUP_CLOSE_HOURS} hours from now`,
  signup_closed: "Sign-ups for this training are closed; it can no longer be edited",
  not_found: "Training not found",
  save_failed: "Could not save the training. Please try again.",
};

// Unknown codes get a generic message: the `?error=` value is never echoed back.
export function trainingErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return code in MESSAGES ? MESSAGES[code as TrainingErrorCode] : MESSAGES.save_failed;
}

// The trainings trigger raises these as exception messages.
export function mapTrainingDbError(error: { message: string }): TrainingErrorCode {
  if (error.message.includes("training_starts_too_soon")) return "starts_too_soon";
  if (error.message.includes("training_signup_closed")) return "signup_closed";
  return "save_failed";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined): value is string {
  return value !== undefined && UUID.test(value);
}
