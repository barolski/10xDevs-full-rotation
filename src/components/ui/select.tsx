import * as React from "react";
import { cn } from "@/lib/utils";

// A native <select> styled to match the Input/Textarea primitives in this folder.
// Native on purpose: it works without JS (like the rest of the sign-up/profile forms,
// which are native POST) and needs no Radix dependency. The browser draws the dropdown
// arrow, so the chrome differs slightly per browser — an accepted trade for zero JS.
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "border-input dark:bg-input/30 h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
