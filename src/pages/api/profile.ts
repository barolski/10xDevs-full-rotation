import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { validateNickname } from "@/lib/profiles";
import { isUuid } from "@/lib/trainings";

// Saves the name rosters show. A session is required by PROTECTED_ROUTES in src/middleware.ts, and
// RLS lets a player update only their own row.
export const POST: APIRoute = async (context) => {
  const fail = (code: string) => context.redirect(`/profile?error=${code}`);

  // Bail before the query rather than sending an empty uuid filter, which PostgREST rejects as 22P02
  // and would surface as a database failure instead of a missing profile.
  const userId = context.locals.user?.id;
  if (!isUuid(userId)) return fail("not_found");

  const form = await context.request.formData();
  const raw = form.get("nickname");
  const result = validateNickname(typeof raw === "string" ? raw : "");
  if (!result.ok) return fail(result.code);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return fail("save_failed");

  const { data, error } = await supabase
    .from("profiles")
    .update({ nickname: result.value })
    .eq("user_id", userId)
    .select("user_id")
    .overrideTypes<{ user_id: string }[], { merge: false }>();

  if (error) return fail("save_failed");
  if (data.length === 0) return fail("not_found");

  return context.redirect("/profile?saved=1");
};
