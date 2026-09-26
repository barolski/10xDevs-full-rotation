import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { isUuid, mapTrainingDbError, trainingInputFromForm, validateTrainingInput } from "@/lib/trainings";

// Access is enforced by ORGANIZER_ROUTES in src/middleware.ts, and again by RLS on public.trainings.
// Edits after sign-ups closed are rejected by the trainings trigger (training_signup_closed).
export const POST: APIRoute = async (context) => {
  const { id } = context.params;
  if (!isUuid(id)) return context.redirect("/organizer?error=not_found");

  const form = await context.request.formData();
  const fail = (code: string) => context.redirect(`/organizer/trainings/${id}/edit?error=${code}`);

  const result = validateTrainingInput(trainingInputFromForm(form), new Date());
  if (!result.ok) return fail(result.code);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return fail("save_failed");

  const { title, startsAt, location, note } = result.value;
  const { data, error } = await supabase
    .from("trainings")
    .update({ title, starts_at: startsAt.toISOString(), location, note })
    .eq("id", id)
    .select("id")
    .overrideTypes<{ id: string }[], { merge: false }>();

  if (error) {
    console.error("[trainings] update failed:", error.message);
    return fail(mapTrainingDbError(error));
  }
  if (data.length === 0) return context.redirect("/organizer?error=not_found");

  return context.redirect(`/organizer/trainings/${id}?updated=1`);
};
