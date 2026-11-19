// risk: #2 (context/foundation/test-plan.md §2) — a training is closed or resolved wrongly.
// facet: the browser-visible part, on the real clock and the real database. Sign-ups are open before
// starts_at - 3h and gone after it (the "finalizing" gap), and once close_due_trainings() runs a training
// with fewer than 10 sign-ups reads "Odwołany". The 9/10/12 threshold matrix, idempotence of a re-run and
// the cron schedule itself belong to the integration layer (Phase 2); the "confirmed" path needs ten
// players and is not driven here.
// pattern: tests/e2e/seed.spec.ts (organizer context creates the data, the setup project's player acts).
import { test, expect } from "@playwright/test";
import { requireEnv, signIn, waitForHydration } from "./helpers";

// Wall-clock time in Poland, the zone the training form is entered in, as a datetime-local value.
function warsawLocal(date: Date): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return parts.replace(" ", "T");
}

test("sign-ups close at starts_at - 3h and a training with one sign-up is then cancelled", async ({
  page,
  browser,
  baseURL,
  request,
}) => {
  // Real clock: the window closes 90-150 s after the training is created, then the test polls for the
  // state. No time is mocked, so the 3-hour boundary is exercised for real.
  test.setTimeout(6 * 60_000);

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseKey = requireEnv("SUPABASE_KEY");
  const title = `E2E close ${Date.now()}`;
  const startsAt = new Date(Math.ceil((Date.now() + 3 * 60 * 60_000 + 90_000) / 60_000) * 60_000);

  // Setup: the seeded organizer creates the training in its own context.
  const organizerContext = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const organizerPage = await organizerContext.newPage();
  await signIn(organizerPage, requireEnv("E2E_ORGANIZER_USERNAME"), requireEnv("E2E_ORGANIZER_PASSWORD"));
  await organizerPage.goto("/organizer/trainings/new");
  // Creating a training must not run twice, so wait for hydration instead of retrying the submit.
  await waitForHydration(organizerPage);
  await organizerPage.getByRole("textbox", { name: "Tytuł" }).fill(title);
  await organizerPage.getByLabel("Start").fill(warsawLocal(startsAt));
  await organizerPage.getByRole("textbox", { name: "Miejsce" }).fill("Hala E2E");
  await organizerPage.getByRole("button", { name: "Utwórz trening" }).click();
  await organizerPage.waitForURL(/\/organizer\/trainings\/[0-9a-f-]{36}\?created=1/);
  const trainingId = new URL(organizerPage.url()).pathname.split("/").pop();
  await organizerContext.close();

  try {
    // Action 1: while the window is open the player can sign up.
    await page.goto(`/t/${trainingId}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("Zapisy otwarte", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Zapisz się" }).click();
    await expect(page.getByText("Zapis przyjęty.")).toBeVisible();

    // Assertion 1: once the boundary passes, the training reads "Finalizacja" and no action is offered
    // (the row is still `open` in the database; only the clock closed it).
    await expect(async () => {
      await page.reload();
      await expect(page.getByText("Finalizacja", { exact: true })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 4 * 60_000, intervals: [5_000] });
    await expect(page.getByRole("button", { name: "Zapisz się" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Wypisz się" })).toHaveCount(0);

    // Action 2: run the finalizer exactly as the cron worker does (anon key, same RPC). The local
    // preview does not run the scheduled handler.
    const close = await request.post(`${supabaseUrl}/rest/v1/rpc/close_due_trainings`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    });
    await expect(close).toBeOK();

    // Assertion 2: one sign-up is below the minimum of 10, so the outcome is "cancelled", and it stays
    // that way after a reload (persisted, not a transient render).
    await page.reload();
    await expect(page.getByText("Odwołany", { exact: true })).toBeVisible();
    await expect(page.getByText("Finalizacja", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Zapisy otwarte", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Zapisz się" })).toHaveCount(0);
  } finally {
    // Cleanup: the UI no longer offers a withdrawal on a cancelled training, but the database allows
    // it. Withdraw as the player through the REST API and assert it, or the active sign-up would block
    // every run that starts within 120 minutes of this training. The training itself stays (no delete
    // endpoint), cancelled and uniquely titled.
    const login = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      headers: { apikey: supabaseKey },
      data: { email: requireEnv("E2E_USERNAME"), password: requireEnv("E2E_PASSWORD") },
    });
    await expect(login).toBeOK();
    const { access_token } = (await login.json()) as { access_token: string };
    const withdraw = await request.patch(
      `${supabaseUrl}/rest/v1/signups?training_id=eq.${trainingId}&status=eq.active`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${access_token}`,
          Prefer: "return=representation",
        },
        data: { status: "withdrawn" },
      },
    );
    await expect(withdraw).toBeOK();
    // Nothing to withdraw only when the run failed before the sign-up; otherwise exactly one row.
    const rows = (await withdraw.json()) as unknown[];
    expect(rows.length).toBeLessThanOrEqual(1);
  }
});
