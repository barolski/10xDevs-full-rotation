import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { loadTraining } from "@/lib/training-queries";
import { isSignupOpen, isUuid } from "@/lib/trainings";
import { mapSignupDbError } from "@/lib/signups";

// The database allows a withdrawal at any time on purpose — a late withdrawal counts as an absence
// (FR-023) and a post-confirmation one promotes the first waitlisted player (FR-016), both owned by
// later slices. Until those exist, this route is the rule: withdrawal only while sign-ups are open.
export const POST: APIRoute = async (context) => {
  const { id } = context.params;
  if (!isUuid(id)) return context.redirect("/dashboard?error=not_found");

  const fail = (code: string) => context.redirect(`/t/${id}?error=${code}`);

  const { training, failed } = await loadTraining(id, context.request.headers, context.cookies);
  if (failed) return fail("save_failed");
  if (!training) return fail("not_found");
  if (!isSignupOpen(new Date(training.starts_at), new Date())) return fail("signup_closed");

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return fail("save_failed");

  // RLS already scopes an update to the caller's own active sign-up; the filters say so explicitly.
  const { data, error } = await supabase
    .from("signups")
    .update({ status: "withdrawn" })
    .eq("training_id", id)
    .eq("user_id", context.locals.user?.id ?? "")
    .eq("status", "active")
    .select("id")
    .overrideTypes<{ id: string }[], { merge: false }>();

  if (error) return fail(mapSignupDbError(error));
  if (data.length === 0) return fail("not_signed_up");

  return context.redirect(`/t/${id}?withdrawn=1`);
};
