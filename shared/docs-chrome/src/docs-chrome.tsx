import type { JSX, ReactNode } from "react";
import { Head } from "@brains/ui-library";

const wordmarkInk = "text-[var(--docs-text)] font-bold";
const wordmarkDot = "text-[var(--docs-accent)] font-bold";
const wordmarkSuffix = "text-[var(--docs-text-muted)]";
const labelText =
  "docs-font-label text-xs uppercase tracking-[0.18em] text-[var(--docs-accent)]";
const displayText = "docs-font-display text-[var(--docs-heading)]";
const buttonBase =
  "inline-flex items-center justify-center rounded-lg border px-[18px] py-2.5 text-sm font-semibold transition-colors duration-150";
const headerLinkBase =
  "relative py-1 text-[15px] text-[var(--docs-text-muted)] transition-colors duration-150 after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-[var(--docs-accent)] after:transition-[width] after:duration-300 hover:text-[var(--docs-text)] hover:after:w-full aria-[current=page]:text-[var(--docs-text)] aria-[current=page]:after:w-full";
/** Header links that fold away on narrow screens; Guides stays, as the way in. */
const headerLink = `${headerLinkBase} hidden min-[861px]:inline-block`;
const primaryHeaderLink = `${headerLinkBase} inline-block`;
const footerLink =
  "docs-font-label text-[13px] text-[var(--docs-text-light)] transition-colors duration-150 hover:text-[var(--docs-text)]";

interface DocsClasses {
  wrap: string;
  label: string;
  display: string;
  button: string;
  primaryButton: string;
}

export const docsClasses: DocsClasses = {
  wrap: "mx-auto max-w-6xl px-6 pt-20 md:px-12 md:pt-24",
  label: labelText,
  display: displayText,
  button: `${buttonBase} border-[var(--docs-text)] text-[var(--docs-text)] hover:border-[var(--docs-accent)] hover:text-[var(--docs-accent)]`,
  primaryButton: `${buttonBase} border-[var(--docs-accent)] bg-[var(--docs-accent)] text-white hover:bg-transparent hover:text-[var(--docs-accent)]`,
};

/** The part of the docs a page belongs to, marked current in the header. */
export type DocsArea = "guides";

const DocsHeader = ({ current }: { current?: DocsArea }): JSX.Element => (
  <nav className="docs-header fixed inset-x-0 top-0 z-[100] flex items-center justify-between px-6 py-4 md:px-10 md:py-5 xl:px-20">
    <a
      href="/docs"
      className="docs-font-body text-xl font-bold"
      aria-label="Brains docs"
    >
      <span className={wordmarkInk}>brains</span>
      <span className={wordmarkDot}>.</span>
      <span className={wordmarkSuffix}>docs</span>
    </a>
    <div className="docs-header__nav flex items-center gap-4 md:gap-8">
      <a
        className={primaryHeaderLink}
        href="/guides"
        {...(current === "guides" && { "aria-current": "page" as const })}
      >
        Guides
      </a>
      <a className={headerLink} href="/docs/roadmap">
        Roadmap
      </a>
      <a className={headerLink} href="https://github.com/rizom-ai/brains">
        GitHub
      </a>
      <a
        href="https://rizom.ai"
        className="inline-flex items-center justify-center rounded-lg border border-[var(--docs-text)] px-4 py-2 text-[13px] font-semibold text-[var(--docs-text)] transition-colors duration-150 hover:border-[var(--docs-accent)] hover:text-[var(--docs-accent)] md:px-6 md:py-2.5 md:text-[15px]"
      >
        Get Brains
      </a>
    </div>
  </nav>
);

const DocsFooter = (): JSX.Element => (
  <footer className="flex flex-col items-center justify-between gap-4 border-t border-[var(--docs-border-light)] py-8 text-center md:flex-row md:gap-6 md:py-6 md:text-left">
    <a href="https://rizom.ai" className="docs-font-body text-[15px] font-bold">
      <span className={wordmarkInk}>rizom</span>
      <span className={wordmarkDot}>.</span>
      <span className={wordmarkSuffix}>ai</span>
    </a>
    <div className="flex flex-wrap items-center justify-center gap-6 md:justify-end">
      <a className={footerLink} href="/guides">
        Guides
      </a>
      <a className={footerLink} href="/docs/roadmap">
        Roadmap
      </a>
      <a className={footerLink} href="https://github.com/rizom-ai/brains">
        GitHub
      </a>
      <a className={footerLink} href="https://rizom.ai">
        Rizom
      </a>
      <button
        id="themeToggle"
        className="docs-font-label cursor-pointer rounded-md border border-[var(--docs-text-light)] bg-transparent px-2.5 py-1.5 text-[13px] text-[var(--docs-text-light)] transition-colors duration-150 hover:border-[var(--docs-text)] hover:text-[var(--docs-text)]"
        type="button"
        data-theme-toggle
      >
        <span className="docs-theme-toggle__light">☀ Light</span>
        <span className="docs-theme-toggle__dark">☾ Dark</span>
      </button>
    </div>
  </footer>
);

const docsDesignCss = `
.docs-handbook {
  --docs-bg: var(--color-bg, #0d0a1a);
  --docs-bg-card: var(--color-bg-card, #1a0a3e);
  --docs-text: var(--color-text, #ffffff);
  --docs-text-muted: var(--color-text-muted, rgb(255 255 255 / 0.6));
  --docs-text-light: var(--color-text-light, rgb(255 255 255 / 0.4));
  --docs-heading: var(--color-heading, #ffffff);
  --docs-accent: var(--color-accent, #c45a08);
  --docs-accent-bright: var(--color-accent-bright, #e87722);
  --docs-border: var(--color-border, rgb(255 255 255 / 0.1));
  --docs-border-light: var(--color-border-light, rgb(255 255 255 / 0.06));
  --docs-font-display: var(--font-display, Fraunces, Georgia, serif);
  --docs-font-body: var(--font-body, Barlow, system-ui, sans-serif);
  --docs-font-label: var(--font-label, JetBrains Mono, ui-monospace, monospace);
  --docs-display-lg: var(--text-display-lg, clamp(40px, 5.5vw, 72px));
  --docs-display-md: var(--text-display-md, clamp(32px, 4vw, 52px));
  --docs-display-sm: var(--text-display-sm, clamp(26px, 3vw, 36px));
  --docs-body-lg: var(--text-body-lg, 18px);
  --docs-body-md: var(--text-body-md, 16px);
  --docs-body-sm: var(--text-body-sm, 15px);
  --docs-label-sm: var(--text-label-sm, 12px);
  min-height: 100vh;
  color: var(--docs-text);
  background: transparent;
  font-family: var(--docs-font-body);
}

/* A page composed of several sections: each keeps the tokens, none fills the screen. */
.docs-handbook--continued {
  min-height: 0;
}

.docs-handbook a {
  color: inherit;
  text-decoration: none;
}

.docs-font-display {
  font-family: var(--docs-font-display);
  font-weight: 520;
}

.docs-font-body {
  font-family: var(--docs-font-body);
}

.docs-font-label {
  font-family: var(--docs-font-label);
}

/* The toggle names the theme it switches to. */
[data-theme="light"] .docs-theme-toggle__light,
:root:not([data-theme="light"]) .docs-theme-toggle__dark {
  display: none;
}

.docs-header {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--docs-bg) 95%, transparent) 0%,
    color-mix(in srgb, var(--docs-bg) 0%, transparent) 100%
  );
  backdrop-filter: blur(8px);
}

.docs-chapter__leader {
  align-self: end;
  margin-bottom: 8px;
  height: 1px;
  background-image: radial-gradient(circle, var(--docs-text-light) 1px, transparent 1.5px);
  background-size: 6px 2px;
  background-repeat: repeat-x;
  background-position: left center;
  opacity: 0.5;
}

.docs-detail-rail .docs-rail__doc[aria-current="page"]::before {
  content: "";
  position: absolute;
  left: 0;
  top: 15px;
  width: 6px;
  height: 1px;
  background: var(--docs-accent);
}

.docs-article__body {
  max-width: 64ch;
  padding: 0 0 20px;
  color: var(--docs-text);
}

.docs-article__body article {
  color: var(--docs-text);
  font-family: var(--docs-font-body);
  font-size: var(--docs-body-md);
  line-height: 1.7;
}

.docs-article__body h1:first-child {
  display: none;
}

.docs-article__body h1,
.docs-article__body h2,
.docs-article__body h3,
.docs-article__body h4 {
  color: var(--docs-heading);
  font-family: var(--docs-font-display);
  font-weight: 400;
  letter-spacing: -0.015em;
}

.docs-article__body h2 {
  font-size: 30px;
  line-height: 1.15;
  margin: 2.6em 0 0.6em;
  padding-bottom: 0;
  border-bottom: 0;
  scroll-margin-top: 96px;
}

.docs-article__body h3 {
  font-size: 21px;
  line-height: 1.3;
  margin: 2em 0 0.5em;
  scroll-margin-top: 96px;
}

.docs-article__body p,
.docs-article__body li {
  color: var(--docs-text);
}

.docs-article__body a {
  color: var(--docs-accent);
  border-bottom: 1px solid color-mix(in srgb, var(--docs-accent) 45%, transparent);
  transition: border-color 0.15s, color 0.15s;
}

.docs-article__body a:hover {
  border-bottom-color: var(--docs-accent);
}

.docs-article__body code {
  color: var(--docs-text);
  background: color-mix(in srgb, var(--docs-bg-card) 72%, transparent);
  border: 1px solid var(--docs-border-light);
  border-radius: 6px;
}

.docs-article__body pre {
  background: color-mix(in srgb, var(--docs-bg-card) 78%, #000 22%);
  border: 1px solid var(--docs-border-light);
  box-shadow: 0 24px 80px rgb(0 0 0 / 0.22);
}

.docs-article__body pre code {
  border: 0;
  background: transparent;
}

`;

const DocsDesignStyles = (): JSX.Element => <style>{docsDesignCss}</style>;

interface DocsPageShellProps {
  title: string;
  description: string;
  children: ReactNode;
  detail?: boolean;
  footer?: boolean;
  contentClassName?: string;
  /** The page lays out its own full-width bands; only the footer keeps the column. */
  bleed?: boolean;
  /** The page goes on in later sections (DocsPageSection), so it does not fill the screen. */
  continues?: boolean;
  /** The part of the docs the page belongs to. */
  current?: DocsArea;
}

export const DocsPageShell = ({
  title,
  description,
  children,
  detail = false,
  footer = false,
  contentClassName = "",
  bleed = false,
  continues = false,
  current,
}: DocsPageShellProps): JSX.Element => (
  <>
    <Head title={title} description={description} />
    <DocsDesignStyles />
    <div
      className={`docs-handbook${detail ? " docs-handbook--detail" : ""}${continues ? " docs-handbook--continued" : ""}`}
    >
      <DocsHeader {...(current && { current })} />
      {bleed ? (
        <>
          {children}
          {footer && (
            <div className="mx-auto max-w-6xl px-6 md:px-12">
              <DocsFooter />
            </div>
          )}
        </>
      ) : (
        <div className={`${docsClasses.wrap} ${contentClassName}`.trim()}>
          {children}
          {footer && <DocsFooter />}
        </div>
      )}
    </div>
  </>
);

/**
 * A later section of a page whose DocsPageShell `continues`: the docs tokens
 * and column, without a second header. Lets a site put sections from other
 * plugins between the parts of a docs page.
 */
export const DocsPageSection = ({
  children,
}: {
  children: ReactNode;
}): JSX.Element => (
  <div className="docs-handbook docs-handbook--continued">
    <div className="mx-auto max-w-6xl px-6 md:px-12">{children}</div>
  </div>
);
