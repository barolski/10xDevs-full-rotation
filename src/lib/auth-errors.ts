// Maps the error code carried by /auth/signin?error=<code> and /auth/signup?error=<code> to a message in
// the UI language. The API routes redirect with Supabase's `error.code` (or `supabase_not_configured`),
// never with its English text, and any value this table does not know renders the generic message, so
// text typed into the URL is never shown. Browser-safe: the sign-in/up form islands import it.
import { t, type Dictionary, type Lang } from "@/i18n";

type AuthErrorKey = keyof Dictionary["auth"]["errors"];

const CODE_TO_KEY: Record<string, AuthErrorKey> = {
  invalid_credentials: "invalidCredentials",
  user_already_exists: "alreadyRegistered",
  email_exists: "alreadyRegistered",
  weak_password: "weakPassword",
  email_address_invalid: "invalidEmail",
  over_request_rate_limit: "tooManyRequests",
  over_email_send_rate_limit: "tooManyRequests",
  email_not_confirmed: "emailNotConfirmed",
  signup_disabled: "signupDisabled",
  supabase_not_configured: "notConfigured",
};

export function authErrorMessage(code: string | null | undefined, lang: Lang): string | null {
  if (!code) return null;
  const errors = t(lang).auth.errors;
  const key = Object.hasOwn(CODE_TO_KEY, code) ? CODE_TO_KEY[code] : "generic";
  return errors[key];
}
