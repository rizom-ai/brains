import type { JSX, ComponentChildren } from "preact";
import { cn } from "./cn";

export interface SectionProps {
  id?: string;
  className?: string;
  children?: ComponentChildren;
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
