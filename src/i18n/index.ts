// Language support: the two languages, the default (Polish), the cookie that remembers the choice and
// the dictionaries. Browser-safe on purpose (no Supabase or `astro:*` imports): React islands import it
// and receive the language from their page as a `lang` prop, never from a module-level "current
// language", which a Workers isolate would share between requests.
import { en } from "@/i18n/en";
import { type Lang } from "@/i18n/lang";
import { pl } from "@/i18n/pl";

export { DEFAULT_LANG, isLang, LANG_COOKIE, LANGS, langFromCookie, LOCALES, type Lang } from "@/i18n/lang";
export { plural } from "@/i18n/plural";

// Widens the Polish literals to `string` (and keeps count functions), so `en` has to match its keys.
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => string
    ? (...args: A) => string
    : { [K in keyof T]: Widen<T[K]> };

export type Dictionary = Widen<typeof pl>;

const DICTIONARIES: Record<Lang, Dictionary> = { pl, en };

export function t(lang: Lang): Dictionary {
  return DICTIONARIES[lang];
}
