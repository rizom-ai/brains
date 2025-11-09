import type { VNode } from "preact";
import { LinkButton } from "./LinkButton";
import type { NavigationItem } from "./NavLinks";

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
   * Site title to display in header
   */
  title: string;

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
  navigation,
  cta,
  variant = "default",
}: HeaderProps): VNode {
  // Variant-specific styles
  const headerClass = variant === "cta" ? "py-4 bg-header" : "py-4";

  const containerClass =
    variant === "cta"
      ? "container mx-auto px-4 max-w-6xl flex flex-row justify-between items-center gap-3"
      : "container mx-auto px-4 max-w-6xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3";

  const titleClass =
    variant === "cta"
      ? "font-bold text-xl text-nav hover:text-accent transition-colors"
      : "font-bold text-xl text-theme hover:text-brand transition-colors";

  const navLinkClass =
    variant === "cta"
      ? "text-nav hover:text-accent transition-colors text-sm sm:text-base"
      : "text-theme hover:text-brand transition-colors text-sm sm:text-base";

  return (
    <header className={headerClass}>
      <div className={containerClass}>
        <a href="/" className={titleClass}>
          {title}
        </a>
        {variant === "cta" ? (
          <div className="flex items-center gap-3 sm:gap-6">
            <nav className="flex flex-wrap gap-3 sm:gap-4">
              {navigation.map((item) => (
                <a key={item.href} href={item.href} className={navLinkClass}>
                  {item.label}
                </a>
              ))}
            </nav>
            {cta && (
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
        ) : (
          <nav className="flex flex-wrap gap-3 sm:gap-4">
            {navigation.map((item) => (
              <a key={item.href} href={item.href} className={navLinkClass}>
                {item.label}
              </a>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
