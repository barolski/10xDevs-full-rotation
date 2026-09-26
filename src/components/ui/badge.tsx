import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// shadcn/ui new-york Badge, written by hand (`npx shadcn add badge` needs network in the authoring session).
// Added variants success / warning / info read the FullRotation status tokens; each status is also a word.
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3.5",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary: "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        // Deliberately not shadcn's solid bg-destructive: all status badges use the -soft/-strong token pair.
        destructive: "border-transparent bg-destructive-soft text-destructive-strong",
        outline: "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        success: "border-transparent bg-success-soft text-success-strong",
        warning: "border-transparent bg-warning-soft text-warning-strong",
        info: "border-transparent bg-info-soft text-info-strong",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
