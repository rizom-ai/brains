import type { JSX } from "preact";
import { cn } from "@brains/ui-library";

export interface DividerProps {
  className?: string;
}

/**
 * 60px-wide amber gradient divider used between section content blocks
 * (e.g. between the Answer headline and the "scales" tagline, or above
 * the Mission headline). Uses the --color-divider token.
 */
const BASE = "w-[60px] h-px bg-[var(--color-divider)] mx-auto";

export const Divider = ({ className }: DividerProps): JSX.Element => (
  <div className={cn(BASE, className)} />
);
