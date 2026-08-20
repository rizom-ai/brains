/** @jsxImportSource react */
import type { JSX, ReactNode } from "react";
import { cn } from "./cn";

export interface BadgeProps {
  children?: ReactNode;
  className?: string;
}

const BASE =
  "inline-flex items-center px-5 py-2 border border-accent text-accent rounded-[20px] font-label text-label-md font-semibold tracking-[0.09375em] uppercase";

export const Badge = ({ children, className }: BadgeProps): JSX.Element => (
  <span className={cn(BASE, className)}>{children}</span>
);
