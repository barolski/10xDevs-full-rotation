import { expect, type Page } from "@playwright/test";

// Every Astro island has hydrated once no `astro-island[ssr]` is left in the DOM. Wait for it
// before the first input into a form whose submit must not run twice (it creates data).
export async function waitForHydration(page: Page) {
  await page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));
}

// Signs in through the real sign-in form. The form is a React island: input typed before it
// hydrates is dropped and its validation then blocks the submit, so retry fill + submit until
// the submit leaves the sign-in page. Clear before filling: re-filling the same value fires no
// change event in a controlled input. Signing in twice changes nothing, so the retry is safe.
export async function signIn(page: Page, username: string, password: string) {
  await page.goto("/auth/signin");
  await expect(async () => {
    await page.getByLabel("Adres e-mail").fill("");
    await page.getByLabel("Adres e-mail").fill(username);
    await page.getByLabel("Hasło", { exact: true }).fill("");
    await page.getByLabel("Hasło", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/auth/signin"), { timeout: 5_000 });
  }).toPass();
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in .env (see context/foundation/test-stack.md, ## E2E)`);
  return value;
}
