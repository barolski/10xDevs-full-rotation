import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { canRateTraining, isUuid } from "@/lib/trainings";
import { loadRoster } from "@/lib/signup-queries";
import { loadTraining } from "@/lib/training-queries";
import { splitRoster } from "@/lib/signups";
import { validateRating } from "@/lib/ratings";

// Set one (training, player) rating for the organizer rating island. There is no clear/delete: a
// played main-list player always keeps a rating row (the page seeds a default 5), so a rating is
// only ever adjusted. Access is enforced by ORGANIZER_ROUTES in src/middleware.ts and again by RLS
// on public.training_ratings — a non-organizer never reaches a successful write. Returns JSON (not
// a redirect) because it is called by fetch() from an island, not a full-page form post.
export const POST: APIRoute = async (context) => {
  const { id } = context.params;
  const bad = (code: string, status: number) => Response.json({ error: code }, { status });
  if (!isUuid(id)) return bad("not_found", 400);

  // Accept JSON (the island) or form-encoded (a no-JS fallback).
  let userId: unknown;
  let rating: unknown;
  const contentType = context.request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body: unknown = await context.request.json().catch(() => null);
    if (!body || typeof body !== "object") return bad("invalid_request", 400);
    userId = (body as Record<string, unknown>).user_id;
    rating = (body as Record<string, unknown>).rating;
  } else {
    const form = await context.request.formData();
    userId = form.get("user_id");
    rating = form.get("rating");
  }

  if (typeof userId !== "string" || !isUuid(userId)) return bad("invalid_request", 400);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return bad("save_failed", 500);

  // A rating is a post-training assessment of players who actually played, so gate on the same two
  // rules the organizer page enforces in its UI (this route is directly callable, so the check can't
  // live only there): the training must have taken place (confirmed + started), and the player must
  // be on its main list — the waitlist did not play. Both loads go through RLS as the organizer.
  const { training, failed: trainingFailed } = await loadTraining(id, context.request.headers, context.cookies);
  if (trainingFailed) return bad("save_failed", 500);
  if (!training) return bad("not_found", 400);
  if (!canRateTraining(training, new Date())) return bad("not_ratable", 409);

  const { entries, failed: rosterFailed } = await loadRoster(id, context.request.headers, context.cookies);
  if (rosterFailed) return bad("save_failed", 500);
  if (!splitRoster(entries).main.some((entry) => entry.user_id === userId)) {
    return bad("not_on_main_list", 409);
  }

  const result = validateRating(rating);
  if (!result.ok) return bad(result.code, 400);

  // Update-then-insert rather than upsert: PostgREST's ON CONFLICT DO UPDATE sets every column in
  // the payload, including training_id/user_id, for which `authenticated` has only an INSERT grant
  // (least privilege) — so an upsert is rejected 42501. The UPDATE path touches only `rating`.
  const { data: updated, error: updateError } = await supabase
    .from("training_ratings")
    .update({ rating: result.value })
    .eq("training_id", id)
    .eq("user_id", userId)
    .select("user_id")
    .overrideTypes<{ user_id: string }[], { merge: false }>();
  if (updateError) return bad("save_failed", 500);

  if (updated.length === 0) {
    const { error: insertError } = await supabase
      .from("training_ratings")
      .insert({ training_id: id, user_id: userId, rating: result.value });
    // A concurrent insert can win the race (unique PK, 23505); last-write-wins (FR-005): retry as
    // an update so our value lands rather than surfacing a spurious failure.
    if (insertError) {
      const { error: retryError } = await supabase
        .from("training_ratings")
        .update({ rating: result.value })
        .eq("training_id", id)
        .eq("user_id", userId);
      if (retryError) return bad("save_failed", 500);
    }
  }

  return Response.json({ rating: result.value });
};
