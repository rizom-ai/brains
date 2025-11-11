import type { JSX, ComponentChildren } from "preact";

export type CardVariant = "vertical" | "horizontal";

export interface CardProps {
  href?: string;
  variant?: CardVariant;
  className?: string;
  children: ComponentChildren;
}

/**
 * Generic card container component used across blog posts, decks, links, and other content.
 *
 * Provides consistent styling with support for vertical (default) and horizontal layouts.
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
  variant = "vertical",
  className = "",
  children,
}: CardProps): JSX.Element => {
  const baseClasses =
    "bg-theme-subtle rounded-lg p-6 hover:shadow-lg transition-shadow border border-theme";

  const variantClasses = {
    vertical: "flex flex-col",
    horizontal: "flex items-start gap-4",
  };

  const classes = `${baseClasses} ${variantClasses[variant]} ${className}`;

  // If href is provided, render as clickable article
  if (href) {
    return (
      <article className={classes}>
        <a href={href} className="contents">
          {children}
        </a>
      </article>
    );
  }

  return <article className={classes}>{children}</article>;
};
