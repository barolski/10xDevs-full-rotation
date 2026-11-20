// One-shot carrier for the email typed into a failed sign-in/sign-up, so the form can show it again after the
// redirect. A cookie, not a query parameter: the address must not reach URLs, history or logs. httpOnly and
// short-lived, scoped to /auth, and cleared by the first page that reads it. The password is never stored.
import type { AstroCookies } from "astro";

export const AUTH_EMAIL_COOKIE = "fr-auth-email";
const MAX_EMAIL_LENGTH = 254;

export function flashEmail(cookies: AstroCookies, email: unknown, secure: boolean) {
  if (typeof email !== "string" || !email.trim()) return;
  cookies.set(AUTH_EMAIL_COOKIE, email.trim().slice(0, MAX_EMAIL_LENGTH), {
    path: "/auth",
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: 60,
  });
}

// Reads and clears the flash. Always clears, so a stale value can never resurface on a later visit.
export function takeFlashEmail(cookies: AstroCookies): string {
  const value = cookies.get(AUTH_EMAIL_COOKIE)?.value ?? "";
  if (cookies.has(AUTH_EMAIL_COOKIE)) cookies.delete(AUTH_EMAIL_COOKIE, { path: "/auth" });
  return value;
}
