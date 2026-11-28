import type { JSX } from "react";
import {
  languagePath,
  SOCIAL_LINK_PLATFORM_LABELS,
  type SiteAlternate,
  type SiteLayoutInfo,
  type SiteLayoutProps,
} from "@rizom/site";
import { Logo } from "./logo";
import { menuWords, pageGloss, PAGES } from "./navigation";
import { parsePhoto } from "./portrait";

/** The brain's profiles elsewhere: every social link but the email. */
function profilesOf(info: SiteLayoutInfo): { href: string; label: string }[] {
  return (info.socialLinks ?? [])
    .filter((link) => link.platform !== "email")
    .map((link) => ({
      href: link.url,
      label: link.label ?? SOCIAL_LINK_PLATFORM_LABELS[link.platform],
    }));
}

/** The address the brain lists as its email link, without the scheme. */
function emailOf(info: SiteLayoutInfo): { href: string; label: string } | null {
  const link = info.socialLinks?.find((entry) => entry.platform === "email");
  if (!link) return null;
  return {
    href: link.url,
    label: link.label ?? link.url.replace(/^mailto:/, ""),
  };
}

/** How the switch names each language, in that language. */
const LANGUAGE_NAMES: Record<string, string> = { en: "EN", "zh-tw": "中文" };

interface FooterLines {
  trade: string;
  credit: string;
  legal: [string, string, string];
}

/** The footer's fixed words, per language; site-info has no field for them. */
const FOOTER_LINES: Record<string, FooterLines> = {
  en: {
    trade: "(Brand consultancy)",
    credit: "Powered by Rizom",
    legal: ["Privacy policy", "Terms of service", "Cookie policy"],
  },
  "zh-tw": {
    trade: "（品牌顧問）",
    credit: "由 Rizom 提供技術支援",
    legal: ["隱私權政策", "服務條款", "Cookie 政策"],
  },
};

const DEFAULT_FOOTER_LINES: FooterLines = {
  trade: "(Brand consultancy)",
  credit: "Powered by Rizom",
  legal: ["Privacy policy", "Terms of service", "Cookie policy"],
};

/** Where the legal pages will be; until they exist the links hold their places. */
const LEGAL_PLACEHOLDER_HREF = "#";

/** Where the credit goes: the network the brain runs on. */
const RIZOM_HREF = "https://rizom.ai";

/**
 * EN / 中文: the languages this page exists in, the one being read first and
 * marked.
 */
function LanguageSwitch({
  language,
  alternates,
  variant,
}: {
  language: string;
  alternates: SiteAlternate[];
  variant?: "pill" | "menu";
}): JSX.Element {
  const reading = (alternate: SiteAlternate): boolean =>
    alternate.language.toLowerCase() === language.toLowerCase();
  const ordered = [
    ...alternates.filter(reading),
    ...alternates.filter((alternate) => !reading(alternate)),
  ];
  return (
    <nav
      className={variant ? `tf-lang tf-lang--${variant}` : "tf-lang"}
      aria-label={menuWords(language).language}
    >
      {ordered.map((alternate, index) => {
        const current = reading(alternate);
        return (
          <span key={alternate.language}>
            {index > 0 && <span className="tf-lang__sep"> / </span>}
            <a
              href={alternate.path}
              lang={alternate.language}
              {...(current
                ? { "aria-current": "page" as const }
                : { hrefLang: alternate.language })}
            >
              {LANGUAGE_NAMES[alternate.language.toLowerCase()] ??
                alternate.language.toUpperCase()}
            </a>
          </span>
        );
      })}
    </nav>
  );
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
 * The paper frame: the logo, the four pages, the language switch and the one
 * way to talk above the story, the pages folding into a menu on small
 * screens; below it, on red, the name as a wordmark beside the pages again,
 * the brain's profiles (each in a new tab) and the email, then the anchor's
 * photo when it has one, the legal pages' places, and the switch again as a
 * pill over the copyright and a quiet credit to Rizom, in the page's
 * language. The switch shows only on a page that exists in more than one
 * language. A small arrow leads back to the top.
 */
export function TheFourthLayout({
  sections,
  siteInfo,
  path = "/",
  language = "en",
  alternates = [],
}: SiteLayoutProps): JSX.Element {
  const email = emailOf(siteInfo);
  const profiles = profilesOf(siteInfo);
  const defaultLanguage = alternates[0]?.language ?? language;
  const pathIn = (page: string): string =>
    languagePath(language, defaultLanguage, page);
  const home = pathIn("/");
  // The build passes a translated page its prefixed path; accept either form.
  const here = path.startsWith("/") ? path : `/${path}`;
  const current = (href: string): { "aria-current"?: "page" } =>
    href === here || href === pathIn(here) ? { "aria-current": "page" } : {};
  const lines = FOOTER_LINES[language.toLowerCase()] ?? DEFAULT_FOOTER_LINES;
  const words = menuWords(language);
  const photo = parsePhoto(siteInfo.photo ?? "");
  const pages = PAGES.map((page) => ({
    ...page,
    href: pathIn(page.path),
    gloss: pageGloss(language, page.id),
  }));
  const talk = siteInfo.cta;
  const switchable = alternates.length > 1;
  return (
    <div
      className={here === home ? "tf-site tf-site--home" : "tf-site"}
      id="top"
      lang={language}
    >
      <header className="tf-bar">
        <a
          className="tf-mark"
          href={home}
          aria-label={`${siteInfo.title} ${words.homeLabel}`}
        >
          <Logo />
        </a>
        <nav className="tf-nav" aria-label={words.main}>
          {pages.map((page) => (
            <a
              key={page.id}
              className="tf-nl"
              href={page.href}
              {...current(page.href)}
            >
              {page.label}
              {page.gloss && <span className="tf-nl__gloss">{page.gloss}</span>}
            </a>
          ))}
        </nav>
        <div className="tf-bar__end">
          {switchable && (
            <LanguageSwitch language={language} alternates={alternates} />
          )}
          {talk && (
            <a className="tf-btn tf-btn--ink" href={talk.buttonLink}>
              {talk.buttonText}
            </a>
          )}
          <details className="tf-menu">
            <summary className="tf-menu__button">
              <svg
                aria-hidden="true"
                width="18"
                height="12"
                viewBox="0 0 18 12"
              >
                <path
                  d="M0 1h18M0 6h18M0 11h18"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
              {words.menu}
            </summary>
            <nav className="tf-menu__panel" aria-label={words.menu}>
              <a className="tf-mlink" href={home} {...current(home)}>
                {words.home}
              </a>
              {pages.map((page) => (
                <a
                  key={page.id}
                  className="tf-mlink"
                  href={page.href}
                  {...current(page.href)}
                >
                  {page.label}
                  {page.gloss && (
                    <span className="tf-mlink__gloss">{page.gloss}</span>
                  )}
                </a>
              ))}
              {talk && (
                <a className="tf-mlink tf-mlink--talk" href={talk.buttonLink}>
                  {talk.buttonText}
                </a>
              )}
              {switchable && (
                <LanguageSwitch
                  language={language}
                  alternates={alternates}
                  variant="menu"
                />
              )}
            </nav>
          </details>
        </div>
      </header>
      <main className="tf-main">{sections}</main>
      <footer className="tf-foot">
        <div className="tf-wrap tf-foot__inner">
          <div className="tf-foot__top">
            <div className="tf-foot__brand">
              <Wordmark title={siteInfo.title} />
              <span className="tf-foot__trade">{lines.trade}</span>
            </div>
            <nav className="tf-foot__nav" aria-label={words.footer}>
              {pages.map((page) => (
                <a key={page.id} className="tf-flink" href={page.href}>
                  {page.label}
                </a>
              ))}
              {talk && (
                <a className="tf-flink" href={talk.buttonLink}>
                  {talk.buttonText}
                </a>
              )}
            </nav>
            <div className="tf-foot__reach">
              {profiles.length > 0 && (
                <div className="tf-foot__social">
                  {profiles.map((profile) => (
                    <a
                      key={profile.href}
                      className="tf-flink"
                      href={profile.href}
                      target="_blank"
                      rel="noopener"
                    >
                      {profile.label}
                    </a>
                  ))}
                </div>
              )}
              {email && (
                <a className="tf-flink tf-foot__email" href={email.href}>
                  {`↳ ${email.label}`}
                </a>
              )}
            </div>
          </div>
          <div className="tf-foot__bottom">
            {photo && (
              <figure className="tf-foot__photo">
                <div className="tf-foot__frame">
                  <img src={photo.src} alt={photo.alt} loading="lazy" />
                </div>
              </figure>
            )}
            <div className="tf-foot__legal">
              {lines.legal.map((page) => (
                <a
                  key={page}
                  className="tf-flink"
                  href={LEGAL_PLACEHOLDER_HREF}
                >
                  {page}
                </a>
              ))}
            </div>
            <div className="tf-foot__end">
              {switchable && (
                <LanguageSwitch
                  language={language}
                  alternates={alternates}
                  variant="pill"
                />
              )}
              <span>{siteInfo.copyright}</span>
              <a
                className="tf-flink tf-foot__credit"
                href={RIZOM_HREF}
                target="_blank"
                rel="noopener"
              >
                {lines.credit}
              </a>
            </div>
          </div>
        </div>
      </footer>
      <a className="tf-top" href="#top" aria-label={words.top}>
        ↑
      </a>
    </div>
  );
}
