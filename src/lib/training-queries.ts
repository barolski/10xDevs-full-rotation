import type { AstroCookies } from "astro";
import { t, type Lang } from "@/i18n";
import { createClient } from "@/lib/supabase";
import { isUuid, TRAINING_COLUMNS, type Training } from "@/lib/trainings";

export interface TrainingLoad {
  training: Training | null;
  // True when the lookup itself failed (no client, DB/network error), as opposed to "no such training".
  failed: boolean;
}

// Server-only (reads secrets through createClient): keep it out of src/lib/trainings.ts,
// which the TrainingForm island bundles for the browser.
export async function loadTraining(
  id: string | undefined,
  headers: Headers,
  cookies: AstroCookies,
): Promise<TrainingLoad> {
  if (!isUuid(id)) return { training: null, failed: false };
  const supabase = createClient(headers, cookies);
  if (!supabase) return { training: null, failed: true };

  const { data, error } = await supabase
    .from("trainings")
    .select(TRAINING_COLUMNS)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<Training, { merge: false }>();

  if (error) return { training: null, failed: true };
  return { training: data, failed: false };
}

// What a page shows when loadTraining returned no training: a temporary failure must not read as "gone".
export function unavailableTraining(failed: boolean, lang: Lang) {
  const d = t(lang).training.unavailable;
  return failed
    ? { status: 503, title: d.loadFailedTitle, message: d.loadFailedMessage }
    : { status: 404, title: d.notFoundTitle, message: d.notFoundMessage };
}
