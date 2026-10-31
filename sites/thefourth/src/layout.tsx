import type { JSX } from "react";
import {
  languagePath,
  type SiteAlternate,
  type SiteLayoutInfo,
  type SiteLayoutProps,
} from "@rizom/site";
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

/** How the switch names each language, in that language. */
const LANGUAGE_NAMES: Record<string, string> = { en: "EN", "zh-tw": "中文" };

/** The footer's two fixed lines, per language; site-info has no field for them. */
const FOOTER_LINES: Record<string, { trade: string; origin: string }> = {
  en: { trade: "(Brand consultancy)", origin: "Made in Taipei" },
  "zh-tw": { trade: "（品牌顧問）", origin: "台北出品" },
};

const DEFAULT_FOOTER_LINES = {
  trade: "(Brand consultancy)",
  origin: "Made in Taipei",
};

/** EN / 中文: the languages this page exists in, the one being read marked. */
function LanguageSwitch({
  language,
  alternates,
}: {
  language: string;
  alternates: SiteAlternate[];
}): JSX.Element {
  return (
    <nav className="tf-lang" aria-label="Language">
      {alternates.map((alternate, index) => {
        const current =
          alternate.language.toLowerCase() === language.toLowerCase();
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
 * The paper frame: the logo, the language switch and the one way to talk
 * above the story; below it, on red, the name as a wordmark, the email, the
 * city and the copyright, in the page's language. The switch shows only on
 * a page that exists in more than one language. There is no menu, no social
 * or legal links until The Fourth's other pages exist.
 */
export function TheFourthLayout({
  sections,
  siteInfo,
  language = "en",
  alternates = [],
}: SiteLayoutProps): JSX.Element {
  const email = emailOf(siteInfo);
  const defaultLanguage = alternates[0]?.language ?? language;
  const home = languagePath(language, defaultLanguage, "/");
  const lines = FOOTER_LINES[language.toLowerCase()] ?? DEFAULT_FOOTER_LINES;
  return (
    <div className="tf-site" lang={language}>
      <header className="tf-bar">
        <a
          className="tf-mark"
          href={home}
          aria-label={`${siteInfo.title} home`}
        >
          <Logo />
        </a>
        <div className="tf-bar__end">
          {alternates.length > 1 && (
            <LanguageSwitch language={language} alternates={alternates} />
          )}
          {siteInfo.cta && (
            <a className="tf-btn tf-btn--ink" href={siteInfo.cta.buttonLink}>
              {siteInfo.cta.buttonText}
            </a>
          )}
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
            {email && (
              <a className="tf-flink tf-foot__email" href={email.href}>
                {`↳ ${email.label}`}
              </a>
            )}
          </div>
          <div className="tf-foot__bottom">
            <span>{lines.origin}</span>
            <span>{siteInfo.copyright}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
