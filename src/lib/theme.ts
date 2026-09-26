// Player-selectable colour theme. The choice lives per device in localStorage; `.dark` on <html>
// switches the token set in src/styles/global.css. Layout.astro applies it before first paint with an inline
// copy of readThemePreference/applyThemePreference: keep that script in sync with these functions.
export const THEME_STORAGE_KEY = "fr-theme";

export type ThemePreference = "light" | "dark" | "system";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    // Storage can throw (private mode, blocked site data): fall back to the system setting.
    return "system";
  }
}

export function saveThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Not persisted; the choice still applies to this page view.
  }
}

export function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyThemePreference(preference: ThemePreference): void {
  const dark = preference === "dark" || (preference === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

// A tiny external store for useSyncExternalStore, so every ThemeToggle (and every tab) shows the same choice.
const CHANGE_EVENT = "fr-theme-change";

// Pages rendered with Layout's `theme` prop (dev kitchen sinks) keep their forced theme: a choice made there
// is only reflected in the toggles, never saved or applied.
let forcedPageChoice: ThemePreference | null = null;

function isThemeForced(): boolean {
  return Boolean(document.documentElement.dataset.themeForced);
}

export function getThemePreferenceSnapshot(): ThemePreference {
  return forcedPageChoice ?? readThemePreference();
}

// SSR can't read the stored choice: render no option as checked until the client snapshot is known.
export function getServerThemePreference(): null {
  return null;
}

export function setThemePreference(preference: ThemePreference): void {
  if (isThemeForced()) {
    forcedPageChoice = preference;
  } else {
    saveThemePreference(preference);
    applyThemePreference(preference);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeThemePreference(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  // While on "System", follow the OS switch live.
  const onMedia = () => {
    if (!isThemeForced() && readThemePreference() === "system") applyThemePreference("system");
  };
  // A choice made in another tab.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    if (!isThemeForced()) applyThemePreference(readThemePreference());
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", onMedia);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onMedia);
  };
}
