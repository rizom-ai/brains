import type { JSX, ComponentChildren } from "preact";

export type HeadingLevel = 1 | 2 | 3;

export interface ProseHeadingProps {
  level: HeadingLevel;
  children: ComponentChildren;
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
  className = "",
}: ProseHeadingProps): JSX.Element => {
  // Base classes that match ProseContent's prose styles
  // Includes typography properties from Tailwind's prose plugin
  const baseClasses = {
    1: "text-4xl font-bold mb-8 mt-0 leading-tight tracking-tight",
    2: "text-3xl font-semibold mt-16 mb-6 border-b pb-4 leading-snug tracking-tight",
    3: "text-2xl font-semibold mt-10 mb-4 leading-snug tracking-tight",
  };

  const Tag = `h${level}` as keyof JSX.IntrinsicElements;
  const classes = `${baseClasses[level]} ${className}`;

  return <Tag className={classes}>{children}</Tag>;
};
