import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";
import { isUuid, TRAINING_COLUMNS, type Training } from "@/lib/trainings";

// Server-only (reads secrets through createClient): keep it out of src/lib/trainings.ts,
// which the TrainingForm island bundles for the browser.
export async function loadTraining(
  id: string | undefined,
  headers: Headers,
  cookies: AstroCookies,
): Promise<Training | null> {
  if (!isUuid(id)) return null;
  const supabase = createClient(headers, cookies);
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("trainings")
    .select(TRAINING_COLUMNS)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<Training, { merge: false }>();

  if (error) console.error("[trainings] load failed:", error.message);
  return data ?? null;
}
