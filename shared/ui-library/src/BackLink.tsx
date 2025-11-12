import type { JSX } from "preact";

export interface BackLinkProps {
  href: string;
  children: string;
  className?: string;
}

/**
 * BackLink component - displays a back navigation link with consistent styling
 *
 * @example
 * ```tsx
 * <BackLink href="/topics">Back to Topics</BackLink>
 * ```
 */
export const BackLink = ({
  href,
  children,
  className = "",
}: BackLinkProps): JSX.Element => {
  return (
    <nav className={`mt-8 pt-6 border-t border-theme ${className}`}>
      <a href={href} className="text-brand hover:text-brand-dark text-sm">
        ← {children}
      </a>
    </nav>
  );
};
