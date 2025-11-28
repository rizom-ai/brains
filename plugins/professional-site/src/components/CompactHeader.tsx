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
      <div className="container mx-auto px-6 md:px-8">
        <div className="max-w-5xl mx-auto flex flex-row justify-between items-center">
          <a
            href="/"
            className="text-brand hover:text-brand-dark transition-colors"
          >
            <Logo title={logo ? undefined : title} height={36} />
          </a>

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
      </div>
    </header>
  );
}
