import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { isUuid } from "@/lib/trainings";
import { mapSignupDbError } from "@/lib/signups";

// A session is required by PROTECTED_ROUTES in src/middleware.ts; who may hold a sign-up and on what
// terms is enforced by RLS and the signups triggers, which this route only reports back.
export const POST: APIRoute = async (context) => {
  const { id } = context.params;
  // A malformed id never reaches the Location header: a non-ASCII value there throws (S-01 F1).
  if (!isUuid(id)) return context.redirect("/dashboard?error=not_found");

  const fail = (code: string) => context.redirect(`/t/${id}?error=${code}`);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return fail("save_failed");

  // training_id is the only column a client may name; user_id, position and status come from the
  // column default and the triggers.
  const { error } = await supabase.from("signups").insert({ training_id: id });
  if (error) return fail(mapSignupDbError(error));

  return context.redirect(`/t/${id}?signed_up=1`);
};
