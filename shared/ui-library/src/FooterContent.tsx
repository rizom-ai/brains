import type { JSX } from "preact";
import { NavLinks, type NavigationItem } from "./NavLinks";
import { ThemeToggle } from "./ThemeToggle";
import { SocialLinks, type SocialLink } from "./SocialLinks";

export interface FooterContentProps {
  primaryNav: NavigationItem[];
  secondaryNav: NavigationItem[];
  copyright?: string | undefined;
  socialLinks?: SocialLink[] | undefined;
  showThemeToggle?: boolean;
  variant?: "default" | "cta";
}

/**
 * Shared footer content component
 * Renders navigation, copyright, and social links
 */
export function FooterContent({
  primaryNav,
  secondaryNav,
  copyright,
  socialLinks,
  showThemeToggle = false,
  variant = "default",
}: FooterContentProps): JSX.Element {
  // Styling based on variant
  const linkClassName =
    variant === "cta"
      ? "text-white hover:text-accent transition-colors text-sm"
      : "text-theme-inverse hover:text-brand-light transition-colors text-sm";

  const copyrightClassName =
    variant === "cta"
      ? "text-sm text-white opacity-80"
      : "text-sm text-theme-inverse";

  const socialIconClassName =
    variant === "cta"
      ? "w-5 h-5 text-white opacity-80 hover:opacity-100"
      : "w-5 h-5 text-theme-inverse opacity-80 hover:opacity-100";

  return (
    <div>
      {/* Navigation links */}
      <nav className={variant === "cta" ? "space-y-3" : "mb-4 space-y-3"}>
        {/* Secondary navigation (first row) */}
        <NavLinks items={secondaryNav} linkClassName={linkClassName} />
        {/* Primary navigation (second row) */}
        <NavLinks items={primaryNav} linkClassName={linkClassName} />
      </nav>

      {/* Bottom row: Copyright (left) | Theme Toggle (center) | Social Links (right) */}
      {(copyright ||
        showThemeToggle ||
        (socialLinks && socialLinks.length > 0)) && (
        <div
          className={`${variant === "cta" ? "mt-6" : "mt-4"} flex flex-col sm:flex-row justify-between items-center gap-4`}
        >
          {/* Left: Copyright */}
          <div className="flex-1 text-center sm:text-left">
            {copyright && <p className={copyrightClassName}>{copyright}</p>}
          </div>

          {/* Center: Theme Toggle */}
          {showThemeToggle && (
            <div className="flex justify-center">
              <ThemeToggle variant="default" size="md" />
            </div>
          )}

          {/* Right: Social Links */}
          <div className="flex-1 flex justify-center sm:justify-end">
            {socialLinks && socialLinks.length > 0 && (
              <SocialLinks
                links={socialLinks}
                iconClassName={socialIconClassName}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
