import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Three-tier hierarchy used across the app instead of ad-hoc per-page text
// classes: Answer is the headline figure a screen exists to show (net
// worth, safe-to-spend, portfolio value); SectionLabel is supporting
// figures/labels (percentages, dates, drift, a card's own title); Meta is
// quiet technical detail (sync source, confidence, classification). See
// apps/web/DESIGN.md's "Typography hierarchy" section.

export function Answer({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn("font-amount text-3xl font-semibold tracking-tight sm:text-4xl", className)}
      {...props}
    />
  );
}

export function SectionLabel({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-sm font-medium text-foreground/80", className)} {...props} />;
}

export function Meta({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-xs text-muted-foreground", className)} {...props} />;
}
