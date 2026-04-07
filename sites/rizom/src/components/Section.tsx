import type { JSX, ComponentChildren } from "preact";
import { cn } from "@brains/ui-library";

export interface SectionProps {
  id?: string;
  /**
   * Extra class names appended after the base container classes.
   * Use this for section-specific padding, alignment, or modifiers
   * (e.g. `py-section text-center`, `reveal min-h-[100dvh]`).
   */
  className?: string;
  children?: ComponentChildren;
}

/**
 * Rizom section container.
 *
 * Provides the horizontal gutter (24 / 40 / 80px responsive), relative
 * positioning, and z-index so content sits on top of the fixed canvas
 * background. Every section on a rizom site wraps its content in this.
 */
const BASE = "px-6 md:px-10 lg:px-20 relative z-[1]";

export const Section = ({
  id,
  className,
  children,
}: SectionProps): JSX.Element => (
  <section id={id} className={cn(BASE, className)}>
    {children}
  </section>
);
