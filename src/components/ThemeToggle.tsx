import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getServerThemePreference,
  getThemePreferenceSnapshot,
  setThemePreference,
  subscribeThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; Icon: LucideIcon }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

interface Props {
  // Icons only (each option keeps its accessible name); for headers on small screens.
  compact?: boolean;
  className?: string;
}

// Light / Dark / System for players. Layout.astro already applied the stored choice before paint;
// this island reflects it through the shared store in src/lib/theme.ts (in sync across toggles and tabs),
// saves changes and follows the OS while on "System".
export default function ThemeToggle({ compact = false, className }: Props) {
  // null during SSR/hydration: no option is shown as checked until the stored choice is known.
  const preference = useSyncExternalStore(
    subscribeThemePreference,
    getThemePreferenceSnapshot,
    getServerThemePreference,
  );

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className={cn("bg-muted inline-flex gap-0.5 rounded-lg border p-0.5", className)}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const checked = preference === value;
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
