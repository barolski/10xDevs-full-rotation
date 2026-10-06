// Language support: the two languages, the default (Polish), the cookie that remembers the choice and
// the dictionaries. Browser-safe on purpose (no Supabase or `astro:*` imports): React islands import it
// and receive the language from their page as a `lang` prop, never from a module-level "current
// language", which a Workers isolate would share between requests.
import { en } from "@/i18n/en";
import { pl } from "@/i18n/pl";

export type Lang = "pl" | "en";

export const LANGS = ["pl", "en"] as const satisfies readonly Lang[];
export const DEFAULT_LANG: Lang = "pl";
export const LANG_COOKIE = "fr-lang";

// Widens the Polish literals to `string` (and keeps count functions), so `en` has to match its keys.
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => string
    ? (...args: A) => string
    : { [K in keyof T]: Widen<T[K]> };

export type Dictionary = Widen<typeof pl>;

const DICTIONARIES: Record<Lang, Dictionary> = { pl, en };

// BCP 47 tags for Intl formatting; the time zone stays Europe/Warsaw whatever the language (see time.ts).
export const LOCALES: Record<Lang, string> = { pl: "pl-PL", en: "en-GB" };

export function isLang(value: unknown): value is Lang {
  return value === "pl" || value === "en";
}

export function t(lang: Lang): Dictionary {
  return DICTIONARIES[lang];
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

// Picks the form for a count with the language's plural rules: Polish has one / few / many / other
// (1; 2-4 and 22-24; 0, 5-21 and 25+; fractions), English one / other. `other` is the required fallback.
export function plural<T>(lang: Lang, count: number, forms: Partial<Record<Intl.LDMLPluralRule, T>> & { other: T }): T {
  const category = new Intl.PluralRules(LOCALES[lang]).select(count);
  return forms[category] ?? forms.other;
}
