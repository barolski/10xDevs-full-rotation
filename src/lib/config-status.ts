import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import type { Dictionary } from "@/i18n";

export interface ConfigStatus {
  name: string;
  configured: boolean;
  // The text lives in the dictionary (`config.items`), so the banner follows the UI language.
  key: keyof Dictionary["config"]["items"];
  docsUrl?: string;
}

export const configStatuses: ConfigStatus[] = [
  {
    name: "Supabase",
    configured: Boolean(SUPABASE_URL && SUPABASE_KEY),
    key: "supabase",
    docsUrl: "https://github.com/przeprogramowani/10x-astro-starter#supabase-configuration",
  },
];

export const missingConfigs = configStatuses.filter((s) => !s.configured);
