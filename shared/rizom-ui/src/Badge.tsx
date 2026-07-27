import type { JSX, ComponentChildren } from "preact";
import { cn } from "@brains/ui-library";

export interface BadgeProps {
  children?: ComponentChildren;
  className?: string;
}

const BASE =
  "inline-flex items-center px-5 py-2 border border-accent text-accent rounded-[20px] font-label text-label-md font-semibold tracking-[0.09375em] uppercase";

export const Badge = ({ children, className }: BadgeProps): JSX.Element => (
  <span className={cn(BASE, className)}>{children}</span>
);
