import { t, type Lang } from "@/i18n";
import { zonedLocalToUtc } from "@/lib/time";

// Sign-ups close this many hours before a training starts. Mirrors `interval '3 hours'` in the
// trainings migration (supabase/migrations/*_trainings.sql), which is the authoritative value.
export const SIGNUP_CLOSE_HOURS = 3;

export const TITLE_MAX = 80;
export const LOCATION_MAX = 120;
export const NOTE_MAX = 500;

// The persisted confirm/cancel outcome (S-03). `open` is the default until the cron finalizes it;
// see public.close_due_trainings(). Mirrors the check constraint in the training_status migration.
export type TrainingStatus = "open" | "confirmed" | "cancelled";

export interface Training {
  id: string;
  title: string;
  starts_at: string;
  location: string;
  note: string | null;
  status: TrainingStatus;
}

export const TRAINING_COLUMNS = "id, title, starts_at, location, note, status";

export function signupClosesAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() - SIGNUP_CLOSE_HOURS * 60 * 60 * 1000);
}

export function isSignupOpen(startsAt: Date, now: Date): boolean {
  return signupClosesAt(startsAt).getTime() > now.getTime();
}

// When a player may withdraw their sign-up. Shared by the withdraw API route and the player panel so
// the gate cannot drift between them (like isSignupOpen). Allowed while sign-ups are open, or on a
// confirmed training before it starts: a late withdrawal frees a slot and promotes the first
// waitlisted player (FR-016). Deliberately closed during `finalizing` (status still `open` but the
// outcome is undecided), on a cancelled training, and after the training has started.
export function canWithdraw(training: Pick<Training, "starts_at" | "status">, now: Date): boolean {
  const startsAt = new Date(training.starts_at);
  return isSignupOpen(startsAt, now) || (training.status === "confirmed" && startsAt.getTime() > now.getTime());
}

// Ratings are a post-training assessment the organizer makes once a session has actually taken
// place (S-06 later balances teams on ratings from already-played trainings). So a rating can be
// set only on a confirmed training that has already started — never on a future, still-open, or
// cancelled one. Mirrored by the organizer page (which hides the UI) and the ratings API route.
export function canRateTraining(training: Pick<Training, "status" | "starts_at">, now: Date): boolean {
  return training.status === "confirmed" && new Date(training.starts_at).getTime() <= now.getTime();
}

// When teams may be (re)generated (S-06): a confirmed training that has NOT started yet. Teams are
// split before the session from the players' PAST-training ratings (team-queries), so generation
// belongs to the upcoming window; once the session has been played, regenerating is pointless — the
// teams were already used on court, and the page shows them read-only. (The split is still VIEWABLE
// after the session; see the page's `showTeams`.) Ratings open on the opposite side of the start
// line (canRateTraining). Shared by the organizer page and the teams API route so the gate cannot
// drift between them.
export function canGenerateTeams(training: Pick<Training, "status" | "starts_at">, now: Date): boolean {
  return training.status === "confirmed" && new Date(training.starts_at).getTime() > now.getTime();
}

// What a view shows. `finalizing` is not a stored status: it is the gap between sign-ups closing
// (starts_at - 3h) and the next cron tick writing the outcome, during which the row is still `open`
// though sign-ups are already closed. Every other value maps straight to the stored status.
export type TrainingDisplayStatus = "open" | "finalizing" | "confirmed" | "cancelled";

export function trainingDisplayStatus(
  training: Pick<Training, "status" | "starts_at">,
  now: Date,
): TrainingDisplayStatus {
  if (training.status !== "open") return training.status;
  return isSignupOpen(new Date(training.starts_at), now) ? "open" : "finalizing";
}

// Badge variant per display status; the label is `t(lang).training.status[status]`. The list, the detail
// screen and the player card all read from here instead of each inventing copy. Every variant is a full
// -soft/-strong token pair (see badge.tsx), which stays legible in dark mode. Four distinct colours on
// purpose: `open` (sign-ups running) must not read as `confirmed` (settled) at a glance.
export const TRAINING_STATUS_VARIANT: Record<TrainingDisplayStatus, "accent" | "warning" | "success" | "destructive"> =
  {
    open: "accent",
    finalizing: "warning",
    confirmed: "success",
    cancelled: "destructive",
  };

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

const ERROR_KEYS = {
  missing_title: "missingTitle",
  title_too_long: "titleTooLong",
  missing_location: "missingLocation",
  location_too_long: "locationTooLong",
  note_too_long: "noteTooLong",
  invalid_start: "invalidStart",
  starts_too_soon: "startsTooSoon",
  signup_closed: "signupClosed",
  not_found: "notFound",
  save_failed: "saveFailed",
} as const satisfies Record<TrainingErrorCode, string>;

// Unknown codes get a generic message: the `?error=` value is never echoed back.
export function trainingErrorMessage(code: string | null, lang: Lang): string | null {
  if (!code) return null;
  const errors = t(lang).training.errors;
  const key = Object.hasOwn(ERROR_KEYS, code) ? ERROR_KEYS[code as TrainingErrorCode] : "saveFailed";
  switch (key) {
    case "titleTooLong":
      return errors.titleTooLong(TITLE_MAX);
    case "locationTooLong":
      return errors.locationTooLong(LOCATION_MAX);
    case "noteTooLong":
      return errors.noteTooLong(NOTE_MAX);
    case "startsTooSoon":
      return errors.startsTooSoon(SIGNUP_CLOSE_HOURS);
    default:
      return errors[key];
  }
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
