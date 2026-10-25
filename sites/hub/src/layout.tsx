import type { JSX } from "react";
import type { SiteLayoutInfo, SiteLayoutProps } from "@rizom/site";

const COMMONS =
  "The method, the platform and the Rizom mark are held by the Rizom Foundation as a commons.";

const RIZOM_LINKS = [
  { label: "rizom.ai", href: "https://rizom.ai" },
  { label: "Work", href: "https://rizom.ai/work" },
  { label: "Foundation", href: "https://rizom.ai/foundation" },
];

/* The site-info entity always carries a copyright, but the framework fills
   an empty one with this placeholder; the footer shows a real signature or
   nothing. */
const COPYRIGHT_FALLBACK = "Powered by Rizom";

function signature(info: SiteLayoutInfo): string | null {
  const value = info.copyright.trim();
  return value && value !== COPYRIGHT_FALLBACK ? value : null;
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
 * The hub's frame: the field of lights fixed behind the story (see
 * ./field), the wordmark and the theme toggle above it, the rail
 * of chapters (filled by the field script) beside it, and the commons below. There is no menu of other pages; the hub has one.
 */
export function HubLayout({
  sections,
  siteInfo,
}: SiteLayoutProps): JSX.Element {
  const signed = signature(siteInfo);
  return (
    <div className="hub-site" lang="en">
      <canvas className="hub-field" aria-hidden="true" />
      <header className="hub-bar">
        <a className="hub-mark" href="/" aria-label={`${siteInfo.title} home`}>
          rizom<b>/hub</b>
        </a>
        <div className="hub-bar__end">
          <button
            type="button"
            className="hub-mode"
            data-theme-toggle=""
            aria-label="Switch between light and dark"
          >
            <ModeIcon />
          </button>
        </div>
      </header>
      <ol className="hub-rail" aria-label="Chapters" />
      <main className="hub-main">{sections}</main>
      <footer className="hub-foot">
        <span>{COMMONS}</span>
        <span className="hub-foot__links">
          {signed && <span>{signed}</span>}
          {RIZOM_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </span>
      </footer>
    </div>
  );
}
