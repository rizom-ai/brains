import type { VNode } from "preact";
import { Button } from "./Button";
import { LinkButton } from "./LinkButton";
import type { NavigationItem } from "./NavLinks";
import { Logo } from "./Logo";

/**
 * CTA configuration interface
 */
export interface CTAConfig {
  heading: string;
  buttonText: string;
  buttonLink: string;
}

/**
 * Header component props
 */
export interface HeaderProps {
  /**
   * Site title to display in header (shown as text if logo not provided)
   */
  title: string;

  /**
   * Optional logo to display instead of title text
   * If true, displays Logo component; if false/undefined, displays title text
   */
  logo?: boolean;

  /**
   * Primary navigation items
   */
  navigation: NavigationItem[];

  /**
   * Optional CTA configuration (only shown in "cta" variant)
   */
  cta?: CTAConfig;

  /**
   * Header variant
   * - "default": Simple header with border, no CTA button
   * - "cta": Full header with background and CTA button
   */
  variant?: "default" | "cta";
}

/**
 * Shared header component for site layouts
 * Provides consistent navigation bar across all brains
 *
 * Used by:
 * - DefaultLayout: Simple header with navigation
 * - CTAFooterLayout: Header with CTA button
 */
export function Header({
  title,
  logo,
  navigation,
  cta,
  variant = "default",
}: HeaderProps): VNode {
  // Variant-specific styles
  const headerClass = "py-4";

  const titleClass =
    variant === "cta"
      ? "font-bold text-xl text-nav hover:text-accent transition-colors"
      : "font-bold text-xl text-theme hover:text-brand transition-colors";

  const navLinkClass =
    variant === "cta"
      ? "text-nav hover:text-accent transition-colors text-sm md:text-base"
      : "text-theme hover:text-brand transition-colors text-sm md:text-base";

  const titleElement = logo ? (
    <a
      href="/"
      className="flex items-center"
      style={{ color: "var(--color-logo)" }}
    >
      <Logo variant="full" height={32} />
    </a>
  ) : (
    <a href="/" className={titleClass}>
      {title}
    </a>
  );

  return (
    <header className={headerClass}>
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="flex flex-row justify-between items-center">
          {titleElement}

          {/* Desktop navigation */}
          <div className="hidden md:flex items-center gap-3 md:gap-6">
            <nav className="flex flex-wrap gap-3 md:gap-4">
              {navigation.map((item) => (
                <a key={item.href} href={item.href} className={navLinkClass}>
                  {item.label}
                </a>
              ))}
            </nav>
            {variant === "cta" && cta && (
              <LinkButton
                href={cta.buttonLink}
                variant="accent"
                size="sm"
                external
                className="whitespace-nowrap"
              >
                {cta.buttonText}
              </LinkButton>
            )}
          </div>

          {/* Mobile hamburger button */}
          <Button
            variant="ghost"
            ssrOnClick="toggleMobileMenu()"
            type="button"
            className="md:hidden p-2 -mr-2 h-auto text-theme hover:text-brand hover:bg-transparent"
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
              <path
                className="menu-icon"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
              <path
                className="close-icon hidden"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </Button>
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
                className="text-theme hover:text-brand transition-colors text-sm py-1"
              >
                {item.label}
              </a>
            ))}
            {cta && (
              <LinkButton
                href={cta.buttonLink}
                variant="accent"
                size="sm"
                external
                className="mt-2"
              >
                {cta.buttonText}
              </LinkButton>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
