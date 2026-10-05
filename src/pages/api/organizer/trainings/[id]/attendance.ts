import type { APIRoute } from "astro";
import { canRateTraining, isUuid } from "@/lib/trainings";
import { loadRoster } from "@/lib/signup-queries";
import { loadTraining } from "@/lib/training-queries";
import { splitRoster } from "@/lib/signups";
import { isAttendanceStatus } from "@/lib/attendance";
import { saveAttendance } from "@/lib/attendance-queries";

// Mark one main-list player present/absent for the organizer attendance UI (S-07, FR-021). Access is
// enforced by ORGANIZER_ROUTES in src/middleware.ts and again by RLS on public.attendance — a
// non-organizer never reaches a successful write. Returns JSON (not a redirect) because it is called
// by fetch() from an island. Gated to the same window as ratings: a played training (confirmed +
// started) and a main-list player — this route is directly callable, so the checks can't live only
// in the UI. Mirrors src/pages/api/organizer/trainings/[id]/ratings.ts.
export const POST: APIRoute = async (context) => {
  const { id } = context.params;
  const bad = (code: string, status: number) => Response.json({ error: code }, { status });
  if (!isUuid(id)) return bad("not_found", 400);

  let userId: unknown;
  let status: unknown;
  const contentType = context.request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body: unknown = await context.request.json().catch(() => null);
    if (!body || typeof body !== "object") return bad("invalid_request", 400);
    userId = (body as Record<string, unknown>).user_id;
    status = (body as Record<string, unknown>).status;
  } else {
    const form = await context.request.formData();
    userId = form.get("user_id");
    status = form.get("status");
  }

  if (typeof userId !== "string" || !isUuid(userId)) return bad("invalid_request", 400);
  if (!isAttendanceStatus(status)) return bad("invalid_request", 400);

  const { training, failed: trainingFailed } = await loadTraining(id, context.request.headers, context.cookies);
  if (trainingFailed) return bad("save_failed", 500);
  if (!training) return bad("not_found", 400);
  if (!canRateTraining(training, new Date())) return bad("not_markable", 409);

  const { entries, failed: rosterFailed } = await loadRoster(id, context.request.headers, context.cookies);
  if (rosterFailed) return bad("save_failed", 500);
  if (!splitRoster(entries).main.some((entry) => entry.user_id === userId)) {
    return bad("not_on_main_list", 409);
  }

  const { failed: saveFailed } = await saveAttendance(id, userId, status, context.request.headers, context.cookies);
  if (saveFailed) return bad("save_failed", 500);

  return Response.json({ status });
};
