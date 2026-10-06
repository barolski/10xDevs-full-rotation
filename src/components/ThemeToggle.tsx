import { useSyncExternalStore } from "react";
import { Moon, Sun, type LucideIcon } from "lucide-react";
import { t, type Lang } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  getServerThemePreference,
  getThemePreferenceSnapshot,
  prefersDark,
  setThemePreference,
  subscribeThemePreference,
} from "@/lib/theme";

const OPTIONS: { value: "light" | "dark"; Icon: LucideIcon }[] = [
  { value: "light", Icon: Sun },
  { value: "dark", Icon: Moon },
];

interface Props {
  lang: Lang;
  // Icons only (each option keeps its accessible name); for the header bar on signed-out pages.
  compact?: boolean;
  // Plain text rows for the account menu.
  menu?: boolean;
  className?: string;
}

// Light / Dark for players. Layout.astro already applied the stored choice before paint;
// this island reflects it through the shared store in src/lib/theme.ts (in sync across toggles and tabs)
// and saves changes. With no stored choice the page follows the OS, so the active option shows the theme
// that is currently applied.
export default function ThemeToggle({ lang, compact = false, menu = false, className }: Props) {
  const d = t(lang).theme;
  // null during SSR/hydration: no option is shown as checked until the stored choice is known.
  const preference = useSyncExternalStore(
    subscribeThemePreference,
    getThemePreferenceSnapshot,
    getServerThemePreference,
  );
  const shown = preference === null ? null : preference === "system" ? (prefersDark() ? "dark" : "light") : preference;

  if (menu) {
    return (
      <div role="group" aria-label={d.group} className={cn("flex flex-col gap-0.5", className)}>
        {OPTIONS.map(({ value }) => {
          const label = d[value];
          const checked = shown === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={checked}
              onClick={() => {
                setThemePreference(value);
              }}
              className={cn(
                "hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring rounded-sm px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2",
                checked && "bg-accent text-accent-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={d.group}
      className={cn("bg-muted inline-flex gap-0.5 rounded-lg border p-0.5", className)}
    >
      {OPTIONS.map(({ value, Icon }) => {
        const label = d[value];
        const checked = shown === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={checked}
            aria-label={compact ? label : undefined}
            title={label}
            onClick={() => {
              setThemePreference(value);
            }}
            className={cn(
              "text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex h-8 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2",
              compact ? "w-8" : "px-3",
              checked && "bg-accent text-accent-foreground shadow-xs",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {!compact && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
