import type { JSX, ReactNode } from "react";
import { cva } from "class-variance-authority";
import { cn } from "./lib/utils";
import type { VariantFunction, VariantValue } from "./variant-types";

export type HeadingLevel = 1 | 2 | 3;

/** Every level maps to a real intrinsic tag, so no level can name a missing one. */
const HEADING_TAGS = { 1: "h1", 2: "h2", 3: "h3" } as const satisfies Record<
  HeadingLevel,
  keyof JSX.IntrinsicElements
>;

export interface ProseHeadingVariantProps {
  level?: VariantValue<HeadingLevel>;
}

const proseHeadingVariants: VariantFunction<ProseHeadingVariantProps> = cva(
  "",
  {
    variants: {
      level: {
        1: "text-4xl font-bold mb-8 mt-0 leading-tight tracking-tight",
        2: "text-3xl font-semibold mt-16 mb-6 border-b pb-4 leading-snug tracking-tight",
        3: "text-2xl font-semibold mt-10 mb-4 leading-snug tracking-tight",
      },
    },
    defaultVariants: {
      level: 1,
    },
  },
);

export interface ProseHeadingProps extends ProseHeadingVariantProps {
  children: ReactNode;
  className?: string;
}

/**
 * Shared prose heading component that matches the typography in ProseContent.
 * Use this for standalone headings (like blog post titles) to ensure consistent
 * styling with headings inside markdown content.
 *
 * Supports h1, h2, and h3 with the same exact styles as ProseContent:
 * - h1: Large, bold, generous spacing (page titles)
 * - h2: Medium, semibold, border-bottom (major sections)
 * - h3: Smaller, semibold (subsections)
 */
export const ProseHeading = ({
  level,
  children,
  className,
}: ProseHeadingProps): JSX.Element => {
  const resolvedLevel = level ?? 1;
  const Tag = HEADING_TAGS[resolvedLevel];

  return (
    <Tag className={cn(proseHeadingVariants({ level }), className)}>
      {children}
    </Tag>
  );
};

export { proseHeadingVariants };
