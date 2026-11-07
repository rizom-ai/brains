/** @jsxImportSource react */
import type { JSX } from "react";
import {
  SOCIAL_LINK_PLATFORM_LABELS,
  type NavigationItem,
  type SiteLayoutInfo,
  type SiteLayoutProps,
} from "@rizom/site";

/* The docs' own sections. The brain also generates an index for every other
   entity type it lists (topics, links, posts); those stay unlinked here, as
   on the other sites whose layout owns the navigation. Labels still come
   from the site's navigation. */
const DOCS_SECTIONS = ["/", "/guides"];

/* The site-info entity always carries a copyright, but the framework fills
   an empty one with this placeholder; the footer shows a real one or none. */
const COPYRIGHT_FALLBACK = "Powered by Rizom";

function signature(info: SiteLayoutInfo): string | null {
  const value = info.copyright.trim();
  return value && value !== COPYRIGHT_FALLBACK ? value : null;
}

/** The page is the item, or sits under it; home is current only on itself. */
function isCurrent(item: NavigationItem, path: string): boolean {
  if (item.href === "/") return path === "/";
  return path === item.href || path.startsWith(`${item.href}/`);
}

function byPriority(items: NavigationItem[]): NavigationItem[] {
  return [...items].sort((a, b) => a.priority - b.priority);
}

function ModeIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M8 2a6 6 0 0 0 0 12z" fill="currentColor" />
    </svg>
  );
}

/**
 * The docs site's frame on every page: the site's name, its navigation, its
 * code and call to action, and the light and dark switch, then the page, then
 * the secondary navigation and copyright. Every word comes from the brain's
 * site info and routes, so it is edited as content, not configured.
 */
export function DocsSiteLayout({
  sections,
  siteInfo,
  path,
}: SiteLayoutProps): JSX.Element {
  const primary = byPriority(
    siteInfo.navigation.primary.filter((item) =>
      DOCS_SECTIONS.includes(item.href),
    ),
  );
  const secondary = byPriority(siteInfo.navigation.secondary);
  const signed = signature(siteInfo);

  return (
    <div className="ds-site">
      <header className="ds-bar">
        <div className="ds-bar__inner">
          <a className="ds-brand" href="/">
            {siteInfo.title}
          </a>
          <nav className="ds-nav" aria-label="Site">
            {primary.map((item) => (
              <a
                key={item.href}
                href={item.href}
                aria-current={isCurrent(item, path) ? "page" : undefined}
              >
                {item.label}
              </a>
            ))}
            {(siteInfo.socialLinks ?? []).map((link) => (
              <a key={link.url} href={link.url}>
                {link.label ?? SOCIAL_LINK_PLATFORM_LABELS[link.platform]}
              </a>
            ))}
          </nav>
          <div className="ds-bar__end">
            {siteInfo.cta && (
              <a className="ds-cta" href={siteInfo.cta.buttonLink}>
                {siteInfo.cta.buttonText}
              </a>
            )}
            <button
              type="button"
              className="ds-mode"
              data-theme-toggle=""
              aria-label="Switch between light and dark"
            >
              <ModeIcon />
            </button>
          </div>
        </div>
      </header>
      <main className="ds-main">{sections}</main>
      <footer className="ds-foot">
        <div className="ds-foot__inner">
          {secondary.length > 0 && (
            <nav className="ds-foot__nav" aria-label="More">
              {secondary.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
            </nav>
          )}
          {signed && <span className="ds-foot__signature">{signed}</span>}
        </div>
      </footer>
    </div>
  );
}
