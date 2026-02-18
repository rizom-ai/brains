import type { JSX, ComponentChildren } from "preact";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/utils";

const cardVariants = cva(
  "bg-theme-subtle rounded-lg border border-theme hover:shadow-lg transition-shadow",
  {
    variants: {
      variant: {
        vertical: "flex flex-col p-6",
        horizontal: "flex flex-col sm:flex-row items-start gap-4 p-6",
        compact: "flex flex-col p-4",
      },
    },
    defaultVariants: {
      variant: "vertical",
    },
  },
);

export type CardVariant = "vertical" | "horizontal" | "compact";

export interface CardProps extends VariantProps<typeof cardVariants> {
  href?: string | undefined;
  className?: string;
  children: ComponentChildren;
}

/**
 * Generic card container component used across blog posts, decks, links, and other content.
 *
 * Provides consistent styling with support for vertical (default), horizontal, and compact layouts.
 * Can optionally be wrapped in a link for clickable cards.
 *
 * @example Vertical card (default)
 * ```tsx
 * <Card>
 *   <CardImage src="..." alt="..." size="large" />
 *   <CardTitle>Title</CardTitle>
 *   <CardMetadata>Author • Date</CardMetadata>
 * </Card>
 * ```
 *
 * @example Horizontal card with link
 * ```tsx
 * <Card variant="horizontal" href="/post/slug">
 *   <CardImage src="..." alt="..." size="small" />
 *   <div>
 *     <CardTitle>Title</CardTitle>
 *     <CardMetadata>Metadata</CardMetadata>
 *   </div>
 * </Card>
 * ```
 */
export const Card = ({
  href,
  variant,
  className,
  children,
}: CardProps): JSX.Element => {
  const classes = cn(cardVariants({ variant }), className);

  // If href is provided, render as clickable article with group for hover effects
  if (href) {
    return (
      <article className={cn(classes, "group")}>
        <a href={href} className="contents">
          {children}
        </a>
      </article>
    );
  }

  return <article className={classes}>{children}</article>;
};

export { cardVariants };
