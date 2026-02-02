import type { JSX, ComponentChildren } from "preact";
import { cn } from "./lib/utils";

export interface CardTitleProps {
  href?: string;
  children: ComponentChildren;
  className?: string;
}

/**
 * Card title component with optional link.
 *
 * Renders as a styled heading with consistent typography.
 * If href is provided, wraps the title in a link with hover effects.
 *
 * @example Title without link
 * ```tsx
 * <CardTitle>My Post Title</CardTitle>
 * ```
 *
 * @example Title with link
 * ```tsx
 * <CardTitle href="/posts/my-post">My Post Title</CardTitle>
 * ```
 */
export const CardTitle = ({
  href,
  children,
  className,
}: CardTitleProps): JSX.Element => {
  const baseClasses = cn("text-2xl font-semibold mb-2 text-theme", className);

  if (href) {
    return (
      <h2 className={baseClasses}>
        <a href={href} className="hover:text-brand">
          {children}
        </a>
      </h2>
    );
  }

  return <h2 className={baseClasses}>{children}</h2>;
};
