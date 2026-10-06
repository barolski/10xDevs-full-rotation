// English dictionary: the alternative language. Typed against the Polish shape, so both languages
// always carry exactly the same keys.
import type { Dictionary } from "@/i18n";

export const en: Dictionary = {
  language: {
    switchTo: {
      pl: "Switch language to Polish",
      en: "Switch language to English",
    },
    short: {
      pl: "PL",
      en: "EN",
    },
  },
  config: {
    attention: "Note:",
    items: {
      supabase: {
        message: "Supabase is not configured — authentication features are disabled.",
        docsLabel: "See the setup instructions",
      },
    },
  },
};
