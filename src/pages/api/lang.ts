import type { APIRoute } from "astro";
import { isLang, LANG_COOKIE } from "@/i18n";
import { safeNext } from "@/lib/redirect";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Remembers the UI language in a cookie and sends the visitor back where they were. Open to everyone
// (signed in or not), so it is not under PROTECTED_ROUTES; it is a plain form post, no JS needed.
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const lang = form.get("lang");
  if (!isLang(lang)) {
    return Response.json({ error: "invalid_language" }, { status: 400 });
  }

  context.cookies.set(LANG_COOKIE, lang, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    httpOnly: true,
    secure: context.url.protocol === "https:",
  });

  return context.redirect(safeNext(form.get("next")) ?? "/", 303);
};
