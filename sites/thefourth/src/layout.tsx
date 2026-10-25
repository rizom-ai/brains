import type { JSX } from "react";
import type { SiteLayoutInfo, SiteLayoutProps } from "@rizom/site";
import { Logo } from "./logo";

/** The address the brain lists as its email link, without the scheme. */
function emailOf(info: SiteLayoutInfo): { href: string; label: string } | null {
  const link = info.socialLinks?.find((entry) => entry.platform === "email");
  if (!link) return null;
  return {
    href: link.url,
    label: link.label ?? link.url.replace(/^mailto:/, ""),
  };
}

/**
 * The paper frame: the logo and the one way to talk above the story, the
 * logo, the sign-off and the email below it. There is no menu until The
 * Fourth's other pages exist.
 */
export function TheFourthLayout({
  sections,
  siteInfo,
}: SiteLayoutProps): JSX.Element {
  const email = emailOf(siteInfo);
  return (
    <div className="tf-site" lang="en">
      <header className="tf-bar">
        <a className="tf-mark" href="/" aria-label={`${siteInfo.title} home`}>
          <Logo />
        </a>
        {siteInfo.cta && (
          <a className="tf-pill tf-pill--ink" href={siteInfo.cta.buttonLink}>
            {siteInfo.cta.buttonText}
          </a>
        )}
      </header>
      <main className="tf-main">{sections}</main>
      <footer className="tf-foot">
        <a
          className="tf-mark tf-mark--small"
          href="/"
          aria-label={`${siteInfo.title} home`}
        >
          <Logo />
        </a>
        <span>{siteInfo.copyright}</span>
        {email && <a href={email.href}>{email.label}</a>}
      </footer>
    </div>
  );
}
