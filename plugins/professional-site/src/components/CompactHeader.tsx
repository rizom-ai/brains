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
 * Includes responsive hamburger menu for mobile
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

          {/* Desktop navigation */}
          <nav className="hidden md:flex gap-6" aria-label="Main navigation">
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

          {/* Mobile hamburger button */}
          <button
            // @ts-expect-error - onclick is valid HTML attribute for SSR
            onclick="toggleMobileMenu()"
            type="button"
            className="md:hidden p-2 text-theme hover:text-brand transition-colors"
            aria-label="Toggle navigation menu"
            aria-expanded="false"
            aria-controls="mobile-menu"
            id="mobile-menu-button"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              {/* Hamburger icon */}
              <path
                className="menu-icon"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
              {/* Close icon (hidden by default) */}
              <path
                className="close-icon hidden"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Mobile navigation menu */}
        <nav
          id="mobile-menu"
          aria-label="Mobile navigation"
          className="md:hidden overflow-hidden transition-all duration-300 ease-in-out max-h-0 opacity-0"
        >
          <div className="flex flex-col gap-3 mt-4 pb-2 pt-4 border-t border-theme">
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                // @ts-expect-error - onclick is valid HTML attribute for SSR
                onclick="closeMobileMenu()"
                className="text-sm text-theme hover:text-brand transition-colors py-1"
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
}
