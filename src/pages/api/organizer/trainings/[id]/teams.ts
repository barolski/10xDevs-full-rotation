import type { APIRoute } from "astro";
import { canGenerateTeams, isUuid } from "@/lib/trainings";
import { loadTraining } from "@/lib/training-queries";
import { loadTeamPlayers, saveTeams } from "@/lib/team-queries";
import { generateTeams } from "@/lib/teams";

// Generate (or regenerate) the two teams for a training (S-06). Takes no body: the split is a
// pure function of the confirmed main-list roster and its ratings/positions. Access is enforced
// by ORGANIZER_ROUTES in src/middleware.ts and again by RLS on public.team_assignments — a
// non-organizer never reaches a successful write. Returns JSON (not a redirect) because it is
// called by fetch() from an island. A successful call replaces any previous split for the
// training (FR-005 last-write-wins); on refusal (FR-020) nothing is written.
export const POST: APIRoute = async (context) => {
  const { id } = context.params;
  const bad = (code: string, status: number) => Response.json({ error: code }, { status });
  if (!isUuid(id)) return bad("not_found", 400);

  const { training, failed: trainingFailed } = await loadTraining(id, context.request.headers, context.cookies);
  if (trainingFailed) return bad("save_failed", 500);
  if (!training) return bad("not_found", 400);
  // Teams can be generated only on a confirmed training that hasn't started yet; this route is
  // directly callable, so the gate can't live only in the page UI.
  if (!canGenerateTeams(training, new Date())) return bad("not_generatable", 409);

  const { players, failed: playersFailed } = await loadTeamPlayers(
    id,
    training.starts_at,
    context.request.headers,
    context.cookies,
  );
  if (playersFailed) return bad("save_failed", 500);

  // Generation always produces a split (never refuses); the page surfaces a warning when the
  // closest split can't meet the average-rating target (FR-020 softened to best-effort).
  const result = generateTeams(players);

  const { failed: saveFailed } = await saveTeams(id, result.players, context.request.headers, context.cookies);
  if (saveFailed) return bad("save_failed", 500);

  return Response.json({
    teams: result.players,
    averages: result.averages,
    avgDiff: result.avgDiff,
    balanced: result.balanced,
    exceededBy: result.exceededBy,
  });
};
