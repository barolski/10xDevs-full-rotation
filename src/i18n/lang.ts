// The supported languages, the default (Polish) and the cookie that remembers the choice. Browser-safe
// (no imports): shared by the dictionaries, the plural helper and the server code.

export type Lang = "pl" | "en";

export const LANGS = ["pl", "en"] as const satisfies readonly Lang[];
export const DEFAULT_LANG: Lang = "pl";
export const LANG_COOKIE = "fr-lang";

// BCP 47 tags for Intl formatting; the time zone stays Europe/Warsaw whatever the language (see time.ts).
export const LOCALES: Record<Lang, string> = { pl: "pl-PL", en: "en-GB" };

export function isLang(value: unknown): value is Lang {
  return value === "pl" || value === "en";
}

// Reads the language from a `Cookie` request header; a missing, malformed or unknown value is the default.
export function langFromCookie(header: string | null): Lang {
  if (!header) return DEFAULT_LANG;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== LANG_COOKIE) continue;
    const value = part.slice(separator + 1).trim();
    return isLang(value) ? value : DEFAULT_LANG;
  }
  return DEFAULT_LANG;
}
