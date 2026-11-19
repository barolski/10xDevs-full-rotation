// Seed test — the pattern every generated E2E test copies.
// Risk #1 (context/foundation/test-plan.md §2): a player lands on the wrong list. This covers the
// browser-visible slice: signing up for a fresh training puts the player on the main list at rank 1,
// the placement survives a reload, and withdrawing removes it. The concurrent last-spot race and the
// 12-player cap belong to the integration layer (Phase 2), not here.
import { test, expect } from "@playwright/test";
import { requireEnv, signIn, waitForHydration } from "./helpers";

test("player who signs up for a training is placed on the main list and keeps the place after reload", async ({
  page,
  browser,
  baseURL,
}) => {
  // Setup: the organizer (seeded local account, signed in in its own context) creates a training
  // with a unique title so parallel runs and re-runs never collide. The start day rotates with the
  // clock (2..361 days ahead, sign-ups stay open) because the app refuses a second sign-up within
  // 120 minutes: a run killed before its cleanup must not block the next run.
  const title = `E2E sign-up ${Date.now()}`;
  const daysAhead = 2 + (Math.floor(Date.now() / 60_000) % 360);
  const start = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const startLocal = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}T18:00`;

  const organizerContext = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const organizerPage = await organizerContext.newPage();
  await signIn(organizerPage, requireEnv("E2E_ORGANIZER_USERNAME"), requireEnv("E2E_ORGANIZER_PASSWORD"));
  await organizerPage.goto("/organizer/trainings/new");
  // Creating a training must not run twice, so wait for hydration instead of retrying the submit.
  await waitForHydration(organizerPage);
  await organizerPage.getByRole("textbox", { name: "Tytuł" }).fill(title);
  await organizerPage.getByLabel("Start").fill(startLocal);
  await organizerPage.getByRole("textbox", { name: "Miejsce" }).fill("Hala E2E");
  await organizerPage.getByRole("button", { name: "Utwórz trening" }).click();
  await organizerPage.waitForURL(/\/organizer\/trainings\/[0-9a-f-]{36}\?created=1/);
  const trainingId = new URL(organizerPage.url()).pathname.split("/").pop();
  await organizerContext.close();

  try {
    // Action: the signed-in player (storageState from the setup project) signs up.
    await page.goto(`/t/${trainingId}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await page.getByRole("button", { name: "Zapisz się" }).click();

    // Assertion: the player is on the main list at rank 01 (marked "ty"), and the list counts one of twelve.
    await expect(page.getByText("Zapis przyjęty.")).toBeVisible();
    await expect(page.getByText("Jesteś na liście.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lista główna 1/12" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: /^01.*ty$/ })).toBeVisible();

    await page.reload();
    await expect(page.getByText("Jesteś na liście.")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: /^01.*ty$/ })).toBeVisible();
  } finally {
    // Cleanup: withdraw, asserted, so a cleanup that fails turns the run red. There is no endpoint
    // to delete a training; the uniquely titled training stays behind in the local database.
    await page.goto(`/t/${trainingId}`);
    const withdraw = page.getByRole("button", { name: "Wypisz się" });
    // Not signed up (the run failed before the sign-up): nothing to clean up, and the real error stays visible.
    if (await withdraw.isVisible()) {
      await withdraw.click();
      await expect(page.getByText("Zapis wycofany.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Zapisz się" })).toBeVisible();
    }
  }
});
