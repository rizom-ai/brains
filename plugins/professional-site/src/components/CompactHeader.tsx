import type { VNode } from "preact";
import { Logo } from "@brains/ui-library";
import type { NavigationItem } from "@brains/site-builder-plugin";

/**
 * Compact header component props
 */
export interface CompactHeaderProps {
  /**
   * Site title to display in header
   */
  title: string;

  /**
   * Optional logo to display instead of title text
   */
  logo?: boolean;

  /**
   * Primary navigation items
   */
  navigation: NavigationItem[];
}

/**
 * Compact header for professional site
 * Minimal, clean navigation with tight spacing
 */
export function CompactHeader({
  title,
  logo,
  navigation,
}: CompactHeaderProps): VNode {
  return (
    <header className="py-4 border-b border-theme">
      <div className="container mx-auto px-6 md:px-12 max-w-4xl flex flex-row justify-between items-center">
        {logo ? (
          <a
            href="/"
            className="flex items-center"
            style={{ color: "var(--color-logo)" }}
          >
            <Logo variant="full" height={28} />
          </a>
        ) : (
          <a
            href="/"
            className="font-semibold text-base text-heading hover:text-brand transition-colors"
          >
            {title}
          </a>
        )}

        <nav className="flex gap-6">
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-theme hover:text-brand transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
