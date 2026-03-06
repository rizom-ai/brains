import type { JSX, ComponentChildren } from "preact";
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
  children?: ComponentChildren;
}

/**
 * Section label — monospace uppercase micro-heading, neon green tinted
 */
function SectionLabel({
  children,
  variant,
}: {
  children: string;
  variant: "default" | "cta";
}): JSX.Element {
  const className =
    variant === "cta"
      ? "text-[10px] font-mono font-bold uppercase tracking-[0.16em] text-white opacity-40 mb-5"
      : "text-[10px] font-mono font-bold uppercase tracking-[0.16em] text-brand opacity-60 mb-5";
  return <div className={className}>{children}</div>;
}

/**
 * Shared footer content component
 * Flat columns (nav + slot) top-aligned, full-width status bar below
 */
export function FooterContent({
  primaryNav,
  secondaryNav,
  copyright,
  socialLinks,
  showThemeToggle = false,
  variant = "default",
  children,
}: FooterContentProps): JSX.Element {
  const linkClassName =
    variant === "cta"
      ? "text-white/70 hover:text-accent text-sm"
      : "text-theme-muted hover:text-brand text-sm";

  const socialIconClassName =
    variant === "cta"
      ? "w-4 h-4 text-white opacity-40 hover:opacity-100 hover:text-accent"
      : "w-4 h-4 text-theme-light hover:text-brand hover:opacity-100";

  const copyrightClassName =
    variant === "cta"
      ? "text-[11px] text-white opacity-30 font-mono tracking-[0.04em]"
      : "text-[11px] text-theme-light font-mono tracking-[0.04em]";

  const hasSecondary = secondaryNav.length > 0;
  const hasSocial = socialLinks && socialLinks.length > 0;

  return (
    <div>
      {/* Main layout: stacked on mobile, row on desktop */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:gap-12">
        {/* Slot content (e.g. newsletter) — first on mobile, pushed right on desktop */}
        {children && (
          <div className="order-first sm:order-last sm:ml-auto pb-7 border-b border-theme-light sm:pb-0 sm:border-b-0">
            {children}
          </div>
        )}

        {/* Nav columns — equal grid on mobile, flex row on desktop */}
        <div className="grid grid-cols-2 sm:flex sm:gap-12 pt-7 sm:pt-0">
          {primaryNav.length > 0 && (
            <div>
              <SectionLabel variant={variant}>Navigate</SectionLabel>
              <NavLinks
                items={primaryNav}
                orientation="vertical"
                linkClassName={linkClassName}
              />
            </div>
          )}

          {hasSecondary && (
            <div>
              <SectionLabel variant={variant}>More</SectionLabel>
              <NavLinks
                items={secondaryNav}
                orientation="vertical"
                linkClassName={linkClassName}
              />
            </div>
          )}
        </div>
      </div>

      {/* Status bar: copyright left, social + toggle right */}
      <div className="mt-7 sm:mt-12 pt-5 border-t border-theme-light flex flex-row justify-between items-center gap-4">
        {copyright && <p className={copyrightClassName}>{copyright}</p>}

        <div className="flex items-center gap-5">
          {hasSocial && (
            <SocialLinks
              links={socialLinks}
              iconClassName={socialIconClassName}
            />
          )}
          {showThemeToggle && <ThemeToggle variant="footer" size="sm" />}
        </div>
      </div>
    </div>
  );
}
