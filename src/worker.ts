import { handle } from "@astrojs/cloudflare/handler";
import { createClient } from "@supabase/supabase-js";

export default {
  fetch: handle,
  // Runs on the wrangler.jsonc cron (every 15 min). Sign-ups are already hard-closed at
  // starts_at - 3h by the signups trigger; this tick only finalizes the outcome. The heavy
  // lifting is in public.close_due_trainings() (security definer, idempotent, time-gated): the
  // worker has no user session, so it authenticates as anon and lets that function bypass RLS.
  async scheduled(controller, env, _ctx) {
    const firedAt = new Date(controller.scheduledTime).toISOString();

    // Mirror createClient() in src/lib/supabase.ts: no Supabase config means no-op, not a crash.
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      console.log(`[scheduled] skipped at ${firedAt}: Supabase not configured`);
      return;
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY, {
      auth: { persistSession: false },
    });

    const response = await supabase.rpc("close_due_trainings");
    if (response.error) {
      console.error(`[scheduled] close_due_trainings failed at ${firedAt}: ${response.error.message}`);
      return;
    }

    // The client is untyped (no generated Database types), so the scalar row count comes back
    // as `any`; funnel it through unknown -> Number so the log line stays type-safe.
    const finalized = Number((response.data as unknown) ?? 0);
    console.log(`[scheduled] finalized ${finalized} training(s) at ${firedAt}`);
  },
} satisfies ExportedHandler<Env>;
