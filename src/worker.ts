import { handle } from "@astrojs/cloudflare/handler";

export default {
  fetch: handle,
  scheduled(controller, _env, _ctx) {
    // TODO(FR-013/014/015): once the `trainings`/`sign_ups` schema exists,
    // replace this heartbeat with real sign-up close logic
    // (main list >=10 -> confirmed, <10 -> cancelled).
    console.log(
      `[scheduled] cron fired at ${new Date(controller.scheduledTime).toISOString()}, cron="${controller.cron}"`,
    );
  },
} satisfies ExportedHandler<Env>;
