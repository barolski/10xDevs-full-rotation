import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { validateNickname, validatePositions } from "@/lib/profiles";
import { isUuid } from "@/lib/trainings";

// Saves the name rosters show plus the player's court positions. A session is required by
// PROTECTED_ROUTES in src/middleware.ts, and RLS lets a player update only their own row.
export const POST: APIRoute = async (context) => {
  const fail = (code: string) => context.redirect(`/profile?error=${code}`);

  // Bail before the query rather than sending an empty uuid filter, which PostgREST rejects as 22P02
  // and would surface as a database failure instead of a missing profile.
  const userId = context.locals.user?.id;
  if (!isUuid(userId)) return fail("not_found");

  const form = await context.request.formData();
  const str = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : "";
  };

  const nickname = validateNickname(str("nickname"));
  if (!nickname.ok) return fail(nickname.code);

  const positions = validatePositions({
    primary: str("primary_position"),
    secondary: str("secondary_position"),
  });
  if (!positions.ok) return fail(positions.code);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return fail("save_failed");

  const { data, error } = await supabase
    .from("profiles")
    .update({
      nickname: nickname.value,
      primary_position: positions.primary,
      secondary_position: positions.secondary,
    })
    .eq("user_id", userId)
    .select("user_id")
    .overrideTypes<{ user_id: string }[], { merge: false }>();

  if (error) return fail("save_failed");
  if (data.length === 0) return fail("not_found");

  return context.redirect("/profile?saved=1");
};
