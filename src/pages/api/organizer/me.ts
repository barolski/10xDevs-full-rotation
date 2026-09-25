import type { APIRoute } from "astro";

// Access is enforced by ORGANIZER_ROUTES in src/middleware.ts.
export const GET: APIRoute = (context) => {
  return Response.json({ userId: context.locals.user?.id, isOrganizer: true });
};
