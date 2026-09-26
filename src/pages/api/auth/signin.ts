import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { safeNext, withNext } from "@/lib/redirect";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;
  const next = safeNext(form.get("next"));

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(withNext(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`, next));
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return context.redirect(withNext(`/auth/signin?error=${encodeURIComponent(error.message)}`, next));
  }

  return context.redirect(next ?? "/");
};
