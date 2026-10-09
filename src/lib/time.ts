// Trainings are entered and shown in Polish wall-clock time, stored as UTC instants (timestamptz).
// Workers run in UTC, so never parse a wall-clock string with `new Date(...)`: convert through these helpers.
import { LOCALES, type Lang } from "@/i18n";

export const TRAINING_TIME_ZONE = "Europe/Warsaw";

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const HOUR = 60 * 60 * 1000;

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TRAINING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// Wall-clock time of `instant` in the training zone, as "YYYY-MM-DDTHH:mm" (the `datetime-local` format).
export function utcToZonedLocalInput(instant: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    partsFormatter.formatToParts(instant).find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

// Converts a training-zone wall-clock string to the instant it names.
// Returns null for malformed input and for a time skipped by the spring-forward DST change;
// an autumn time that occurs twice resolves to the earlier instant.
export function zonedLocalToUtc(local: string): Date | null {
  const match = LOCAL_INPUT.exec(local);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  if (Number.isNaN(asUtc)) return null;

  // The zone offset differs by at most one DST step within a day, so the offsets a day either side
  // cover every candidate. Keep the candidates whose wall-clock time really is `local`.
  const offsetAt = (ms: number) => Date.parse(`${utcToZonedLocalInput(new Date(ms))}Z`) - ms;
  const candidates = [offsetAt(asUtc - 24 * HOUR), offsetAt(asUtc + 24 * HOUR)]
    .map((offset) => asUtc - offset)
    .filter((ms) => utcToZonedLocalInput(new Date(ms)) === local);

  return candidates.length ? new Date(Math.min(...candidates)) : null;
}

// One display formatter per UI language; the time zone is always the training zone.
const displayFormatters: Record<Lang, Intl.DateTimeFormat> = {
  pl: createDisplayFormatter("pl"),
  en: createDisplayFormatter("en"),
};

function createDisplayFormatter(lang: Lang) {
  return new Intl.DateTimeFormat(LOCALES[lang], {
    timeZone: TRAINING_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

// The band on the player training card: weekday, day, month and time, no year.
const bandFormatters: Record<Lang, Intl.DateTimeFormat> = {
  pl: createBandFormatter("pl"),
  en: createBandFormatter("en"),
};

function createBandFormatter(lang: Lang) {
  return new Intl.DateTimeFormat(LOCALES[lang], {
    timeZone: TRAINING_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

// e.g. "wt., 13 paź, 19:30" (pl) / "Tue, 13 Oct, 19:30" (en)
export function formatTrainingBand(instant: Date, lang: Lang): string {
  return bandFormatters[lang].format(instant);
}

// e.g. "wt., 6 paź 2026, 19:00" (pl) / "Tue, 6 Oct 2026, 19:00" (en)
export function formatTrainingDateTime(instant: Date, lang: Lang): string {
  return displayFormatters[lang].format(instant);
}
