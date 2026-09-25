import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard"];
const ORGANIZER_ROUTES = ["/organizer", "/api/organizer"];
// Sign-in/up forms make no sense for a signed-in user; send them to the app instead.
const AUTH_ROUTES = ["/auth/signin", "/auth/signup"];

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  context.locals.user = null;
  context.locals.isOrganizer = false;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

    // Fail closed: only an explicit `true` from is_organizer() grants the role.
    if (user) {
      const result = await supabase.rpc("is_organizer");
      // No generated DB types yet, so rpc() data is `any`; treat it as `unknown`.
      const isOrganizer: unknown = result.data;
      if (result.error) {
        console.error("[middleware] is_organizer() failed:", result.error.message);
      }
      context.locals.isOrganizer = !result.error && isOrganizer === true;
    }
  }

  const { pathname } = context.url;

  if (context.locals.user && AUTH_ROUTES.some((route) => matchesRoute(pathname, route))) {
    return context.redirect("/dashboard");
  }

  if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  if (ORGANIZER_ROUTES.some((route) => matchesRoute(pathname, route))) {
    const isApi = matchesRoute(pathname, "/api/organizer");

    if (!context.locals.user) {
      return isApi ? Response.json({ error: "unauthorized" }, { status: 401 }) : context.redirect("/auth/signin");
    }
    if (!context.locals.isOrganizer) {
      // Rewrite (not redirect) so the response carries the 403 status set by the page.
      return isApi ? Response.json({ error: "forbidden" }, { status: 403 }) : next("/403");
    }
  }

  return next();
});
