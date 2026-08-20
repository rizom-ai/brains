/** @jsxImportSource react */
import type { JSX, ReactNode } from "react";
import { cn } from "./cn";

export interface SectionProps {
  id?: string;
  className?: string;
  children?: ReactNode;
}

export const GUTTER = "px-6 md:px-10 xl:px-20";

const BASE = `${GUTTER} relative z-[1]`;

export const Section = ({
  id,
  className,
  children,
}: SectionProps): JSX.Element => (
  <section id={id} className={cn(BASE, className)}>
    {children}
  </section>
);
