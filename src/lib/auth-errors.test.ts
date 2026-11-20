import { describe, expect, it } from "vitest";
import { t } from "@/i18n";
import { authErrorMessage } from "@/lib/auth-errors";

describe("authErrorMessage", () => {
  it("returns nothing when there is no error", () => {
    expect(authErrorMessage(null, "pl")).toBeNull();
    expect(authErrorMessage(undefined, "en")).toBeNull();
    expect(authErrorMessage("", "pl")).toBeNull();
  });

  it.each(["pl", "en"] as const)("maps a known code to the %s message", (lang) => {
    expect(authErrorMessage("invalid_credentials", lang)).toBe(t(lang).auth.errors.invalidCredentials);
    expect(authErrorMessage("email_exists", lang)).toBe(t(lang).auth.errors.alreadyRegistered);
  });

  // The point of the lookup: nothing from the URL is ever echoed into the page.
  it.each([
    "Your account is locked, contact support at evil.example",
    "<script>alert(1)</script>",
    "constructor",
    "__proto__",
    "toString",
  ])("falls back to the generic message for %j and never echoes it", (code) => {
    const message = authErrorMessage(code, "en");
    expect(message).toBe(t("en").auth.errors.generic);
    expect(message).not.toContain(code);
  });
});
