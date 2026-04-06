import type { VNode } from "preact";
import { Logo } from "./Logo";
import { Button } from "./Button";
import { LinkButton } from "./LinkButton";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "./lib/utils";
import type { NavigationItem } from "@brains/plugins";

/**
 * Compact header component props
 */
export interface HeaderProps {
  /**
   * Site title to display in header
   */
  title: string;

  /**
   * Optional logo to display instead of title text
   */
  logo?: boolean;

  /**
   * Optional CSS class for the title/logo text
   * Overrides the Logo component's default text styling
   */
  titleClassName?: string;

  /**
   * Primary navigation items
   */
  navigation: NavigationItem[];

  /**
   * Optional CTA button in the header
   */
  cta?: {
    buttonText: string;
    buttonLink: string;
  };

  /**
   * Show theme toggle button in header
   */
  showThemeToggle?: boolean;

  /**
   * Optional CSS class for the theme toggle button
   */
  themeToggleClassName?: string;
}

/**
 * Compact header — constrained to max-w-layout
 * Minimal, clean navigation with responsive hamburger menu
 */
export function Header({
  title,
  logo,
  titleClassName,
  navigation,
  cta,
  showThemeToggle = false,
  themeToggleClassName,
}: HeaderProps): VNode {
  const titleElement = logo ? (
    <Logo height={36} />
  ) : titleClassName ? (
    <span className={titleClassName}>{title}</span>
  ) : (
    <Logo title={title} height={36} />
  );

  return (
    <header className="py-4 border-b border-theme">
      <div className="max-w-layout mx-auto px-6 md:px-8">
        <div className="flex flex-row justify-between items-center">
          <a href="/" className="text-logo hover:opacity-80 transition-opacity">
            {titleElement}
          </a>

          {/* Desktop navigation */}
          <div className="hidden md:flex items-center gap-6">
            <nav className="flex gap-6" aria-label="Main navigation">
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
            {showThemeToggle && (
              <ThemeToggle
                size="sm"
                {...(themeToggleClassName
                  ? { className: themeToggleClassName }
                  : {})}
              />
            )}
          </div>

          {/* Mobile hamburger button */}
          <Button
            variant="ghost"
            ssrOnClick="toggleMobileMenu()"
            type="button"
            className={cn(
              "md:hidden p-2 h-auto",
              "text-theme hover:text-brand hover:bg-transparent",
            )}
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
                className="text-sm text-theme hover:text-brand transition-colors py-1"
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
            {showThemeToggle && (
              <div className="pt-2 mt-2 border-t border-theme">
                <ThemeToggle
                  size="sm"
                  {...(themeToggleClassName
                    ? { className: themeToggleClassName }
                    : {})}
                />
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
