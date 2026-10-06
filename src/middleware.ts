import { defineMiddleware } from "astro:middleware";
import { isLang, langFromCookie } from "@/i18n";
import { createClient } from "@/lib/supabase";
import { safeNext, withNext } from "@/lib/redirect";

const PROTECTED_ROUTES = ["/dashboard", "/t", "/profile", "/api/profile", "/api/trainings"];
const ORGANIZER_ROUTES = ["/organizer", "/api/organizer"];
// Sign-in/up forms make no sense for a signed-in user; send them to the app instead.
const AUTH_ROUTES = ["/auth/signin", "/auth/signup"];

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  // Set first so every response path (redirects, API routes, rewrites) has the language.
  context.locals.lang = langFromCookie(context.request.headers.get("cookie"));
  // Dev only (the dev pages 404 in production): `?lang=pl|en` previews the other language without the cookie.
  if (import.meta.env.DEV) {
    const preview = context.url.searchParams.get("lang");
    if (isLang(preview)) context.locals.lang = preview;
  }
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

  const { pathname, search } = context.url;
  // Carry the blocked path through sign-in so the user lands back on it.
  const signInRedirect = withNext("/auth/signin", safeNext(pathname + search));

  if (context.locals.user && AUTH_ROUTES.some((route) => matchesRoute(pathname, route))) {
    return context.redirect(safeNext(context.url.searchParams.get("next")) ?? "/dashboard");
  }

  // An API route answers as an API: a missing session is a 401, not a redirect to an HTML page.
  const isApi = matchesRoute(pathname, "/api");
  const unauthenticated = () =>
    isApi ? Response.json({ error: "unauthorized" }, { status: 401 }) : context.redirect(signInRedirect);

  if (PROTECTED_ROUTES.some((route) => matchesRoute(pathname, route))) {
    if (!context.locals.user) {
      return unauthenticated();
    }
  }

  if (ORGANIZER_ROUTES.some((route) => matchesRoute(pathname, route))) {
    if (!context.locals.user) {
      return unauthenticated();
    }
    if (!context.locals.isOrganizer) {
      // Rewrite (not redirect) so the response carries the 403 status set by the page.
      return isApi ? Response.json({ error: "forbidden" }, { status: 403 }) : next("/403");
    }
  }

  return next();
});
