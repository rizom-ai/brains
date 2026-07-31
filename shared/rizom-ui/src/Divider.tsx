import type { JSX } from "preact";
import { cn } from "@brains/ui-library";

export interface DividerProps {
  className?: string;
}

const BASE = "w-[60px] h-px bg-[var(--color-divider)] mx-auto";

export const Divider = ({ className }: DividerProps): JSX.Element => (
  <div className={cn(BASE, className)} />
);
