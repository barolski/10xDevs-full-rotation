// Polish dictionary: the default language, and the source of the dictionary shape. `en.ts` is typed
// against this object (see `Dictionary` in index.ts), so a key present here and missing there (or the
// reverse) fails `npx astro check`. Browser-safe on purpose: islands import it.
//
// An entry that depends on a count is a function of the number; use `plural()` from "@/i18n" inside it.

export const pl = {
  language: {
    // Names the switch for assistive technology; the visible text is the short code of the other language.
    switchTo: {
      pl: "Zmień język na polski",
      en: "Zmień język na angielski",
    },
    short: {
      pl: "PL",
      en: "EN",
    },
  },
  config: {
    attention: "Uwaga:",
    items: {
      supabase: {
        message: "Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone.",
        docsLabel: "Zobacz instrukcję konfiguracji",
      },
    },
  },
};
