import { test as setup, expect } from "@playwright/test";
import { requireEnv, signIn } from "./helpers";

const authFile = "playwright/.auth/user.json";

setup("sign in once and save the session", async ({ page }) => {
  await signIn(page, requireEnv("E2E_USERNAME"), requireEnv("E2E_PASSWORD"));
  // Only a signed-in user gets the dashboard link in the header.
  await expect(page.getByRole("link", { name: "Panel", exact: true })).toBeVisible();

  await page.context().storageState({ path: authFile });
});
