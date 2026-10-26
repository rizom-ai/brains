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

/** The site's title as the footer's wordmark, a word to a line. */
function Wordmark({ title }: { title: string }): JSX.Element {
  const words = title.split(" ");
  return (
    <span className="tf-foot__name">
      {words.flatMap((word, index) =>
        index === 0 ? [word] : [<br key={index} />, word],
      )}
    </span>
  );
}

/**
 * The paper frame: the logo and the one way to talk above the story; below
 * it, on red, the name as a wordmark, the email, the city and the
 * copyright. There is no menu, no social or legal links and no language
 * switch until The Fourth's other pages exist.
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
          <a className="tf-btn tf-btn--ink" href={siteInfo.cta.buttonLink}>
            {siteInfo.cta.buttonText}
          </a>
        )}
      </header>
      <main className="tf-main">{sections}</main>
      <footer className="tf-foot">
        <div className="tf-wrap tf-foot__inner">
          <div className="tf-foot__top">
            <div className="tf-foot__brand">
              <Wordmark title={siteInfo.title} />
              <span className="tf-foot__trade">(Brand consultancy)</span>
            </div>
            {email && (
              <a className="tf-flink tf-foot__email" href={email.href}>
                {`↳ ${email.label}`}
              </a>
            )}
          </div>
          <div className="tf-foot__bottom">
            <span>Made in Taipei</span>
            <span>{siteInfo.copyright}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
