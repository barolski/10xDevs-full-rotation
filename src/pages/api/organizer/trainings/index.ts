import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { mapTrainingDbError, trainingInputFromForm, validateTrainingInput } from "@/lib/trainings";

// Access is enforced by ORGANIZER_ROUTES in src/middleware.ts, and again by RLS on public.trainings.
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const fail = (code: string) => context.redirect(`/organizer/trainings/new?error=${code}`);

  const result = validateTrainingInput(trainingInputFromForm(form), new Date());
  if (!result.ok) return fail(result.code);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return fail("save_failed");

  const { title, startsAt, location, note } = result.value;
  const { data, error } = await supabase
    .from("trainings")
    .insert({ title, starts_at: startsAt.toISOString(), location, note })
    .select("id")
    .single()
    .overrideTypes<{ id: string }, { merge: false }>();

  if (error) {
    console.error("[trainings] create failed:", error.message);
    return fail(mapTrainingDbError(error));
  }

  return context.redirect(`/organizer/trainings/${data.id}?created=1`);
};
