import type { JSX, ComponentChildren } from "preact";
import { NavLinks, type NavigationItem } from "./NavLinks";
import { ThemeToggle } from "./ThemeToggle";
import { SocialLinks, type SocialLink } from "./SocialLinks";
import { Logo } from "./Logo";

export interface FooterContentProps {
  primaryNav: NavigationItem[];
  secondaryNav: NavigationItem[];
  copyright?: string | undefined;
  socialLinks?: SocialLink[] | undefined;
  showThemeToggle?: boolean;
  variant?: "default" | "cta";
  /** Optional brand block — wordmark + tagline displayed on the left. */
  title?: string | undefined;
  tagline?: string | undefined;
  children?: ComponentChildren;
}

/**
 * Section label — small mono caps, accent-tinted.
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
      ? "font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-white/70 mb-5"
      : "font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-accent/80 mb-5";
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
  title,
  tagline,
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
  const hasBrand = Boolean(title);
  // children is `ComponentChildren` (often an array of slot renders).
  // Treat empty arrays as "no slot content" so the slot div doesn't render
  // an empty column.
  const hasSlot = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);
  const taglineColor = variant === "cta" ? "text-white/60" : "text-theme-muted";

  return (
    <div>
      {/* Top row — brand block | nav columns | optional slot */}
      <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:gap-12">
        {/* Brand block (left) — wordmark + tagline */}
        {hasBrand && (
          <div className="sm:max-w-[18rem] sm:flex-1">
            <a href="/" className="text-logo inline-block mb-3">
              <Logo title={title} />
            </a>
            {tagline && (
              <p
                className={`font-heading italic font-light text-[0.95rem] leading-[1.55] ${taglineColor} max-w-[32ch] [font-variation-settings:'opsz'_24,'SOFT'_50]`}
              >
                {tagline}
              </p>
            )}
          </div>
        )}

        {/* Nav columns */}
        <div className="grid grid-cols-2 sm:flex sm:gap-12">
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

        {/* Slot column (right) — newsletter or other plugin content */}
        {hasSlot && (
          <div className="sm:ml-auto sm:max-w-[20rem]">{children}</div>
        )}
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
