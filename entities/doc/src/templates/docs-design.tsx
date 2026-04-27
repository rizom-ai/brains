import type { JSX } from "preact";
import {
  Ecosystem as RizomEcosystem,
  getRizomEcosystemContent,
} from "@rizom/ui";
import type { DocWithData } from "../schemas/doc";

export type GroupedDocs = Array<{ section: string; docs: DocWithData[] }>;

const numerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function sortDocs(docs: DocWithData[]): DocWithData[] {
  return [...docs].sort((a, b) => {
    const order = a.metadata.order - b.metadata.order;
    if (order !== 0) return order;
    return a.metadata.title.localeCompare(b.metadata.title);
  });
}

export function groupDocs(docs: DocWithData[]): GroupedDocs {
  const groups = new Map<string, DocWithData[]>();
  for (const doc of sortDocs(docs)) {
    const section = doc.metadata.section;
    groups.set(section, [...(groups.get(section) ?? []), doc]);
  }
  return [...groups.entries()].map(([section, sectionDocs]) => ({
    section,
    docs: sectionDocs,
  }));
}

export function hrefFor(doc: DocWithData): string {
  return `/docs/${doc.metadata.slug}`;
}

export function sectionId(index: number): string {
  return `section-${index + 1}`;
}

export function romanNumeral(index: number): string {
  return numerals[index] ?? String(index + 1);
}

export function formatCount(count: number): string {
  return count.toString().padStart(2, "0");
}

interface DocsHeaderProps {
  ecosystemHref?: string;
}

const wordmarkInk = "text-[var(--docs-text)] font-bold";
const wordmarkDot = "text-[var(--docs-accent)] font-bold";
const wordmarkSuffix = "text-[var(--docs-text-muted)]";
const labelText =
  "docs-font-label text-xs uppercase tracking-[0.18em] text-[var(--docs-accent)]";
const displayText = "docs-font-display text-[var(--docs-heading)]";
const buttonBase =
  "inline-flex items-center justify-center rounded-lg border px-[18px] py-2.5 text-sm font-semibold transition-colors duration-150";

export const docsClasses = {
  wrap: "mx-auto max-w-6xl px-6 pt-20 md:px-12 md:pt-24",
  label: labelText,
  display: displayText,
  button: `${buttonBase} border-[var(--docs-text)] text-[var(--docs-text)] hover:border-[var(--docs-accent)] hover:text-[var(--docs-accent)]`,
  primaryButton: `${buttonBase} border-[var(--docs-accent)] bg-[var(--docs-accent)] text-white hover:bg-transparent hover:text-[var(--docs-accent)]`,
};

export const DocsHeader = ({
  ecosystemHref = "/docs#ecosystem",
}: DocsHeaderProps): JSX.Element => (
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
      <a href="/docs/roadmap">Roadmap</a>
      <a href="https://github.com/rizom-ai/brains">GitHub</a>
      <a href={ecosystemHref}>Ecosystem</a>
      <a href="https://rizom.ai" className="docs-header__cta">
        Get Brains
      </a>
    </div>
  </nav>
);

export const DocsEcosystem = (): JSX.Element => (
  <RizomEcosystem {...getRizomEcosystemContent()} />
);

export const DocsFooter = (): JSX.Element => (
  <footer className="flex flex-col items-center justify-between gap-4 border-t border-[var(--docs-border-light)] py-8 text-center md:flex-row md:gap-6 md:py-6 md:text-left">
    <a href="https://rizom.ai" className="docs-font-body text-[15px] font-bold">
      <span className={wordmarkInk}>rizom</span>
      <span className={wordmarkDot}>.</span>
      <span className={wordmarkSuffix}>ai</span>
    </a>
    <div className="flex flex-wrap items-center justify-center gap-6 md:justify-end">
      <a className="docs-footer__link" href="/docs/roadmap">
        Roadmap
      </a>
      <a
        className="docs-footer__link"
        href="https://github.com/rizom-ai/brains"
      >
        GitHub
      </a>
      <a className="docs-footer__link" href="https://rizom.ai">
        Rizom
      </a>
      <button id="themeToggle" className="docs-footer__toggle" type="button">
        ☀ Light
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
  --docs-ecosystem-title: clamp(34px, 4.4vw, 60px);
  min-height: 100vh;
  color: var(--docs-text);
  background: transparent;
  font-family: var(--docs-font-body);
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

.docs-header {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--docs-bg) 95%, transparent) 0%,
    color-mix(in srgb, var(--docs-bg) 0%, transparent) 100%
  );
  backdrop-filter: blur(8px);
}

.docs-header__nav a {
  position: relative;
  padding: 4px 0;
  color: var(--docs-text-muted);
  font-family: var(--docs-font-body);
  font-size: 15px;
  transition: color 0.15s;
}

.docs-header__nav a::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: 0;
  height: 1px;
  width: 0;
  background: var(--docs-accent);
  transition: width 0.3s;
}

.docs-header__nav a:hover {
  color: var(--docs-text);
}

.docs-header__nav a:hover::after {
  width: 100%;
}

.docs-header__nav a.docs-header__cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--docs-text);
  border-radius: 8px;
  padding: 8px 16px;
  color: var(--docs-text);
  font-size: 13px;
  font-weight: 600;
}

.docs-header__nav a.docs-header__cta::after {
  display: none;
}

.docs-header__nav a.docs-header__cta:hover {
  color: var(--docs-accent);
  border-color: var(--docs-accent);
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

.docs-footer__link,
.docs-footer__toggle {
  color: var(--docs-text-light);
  font-family: var(--docs-font-label);
  font-size: 13px;
}

.docs-footer__link {
  transition: color 0.15s;
}

.docs-footer__link:hover {
  color: var(--docs-text);
}

.docs-footer__toggle {
  border: 1px solid var(--docs-text-light);
  border-radius: 6px;
  background: transparent;
  padding: 6px 10px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.docs-footer__toggle:hover {
  color: var(--docs-text);
  border-color: var(--docs-text);
}

.docs-page-link:hover .docs-page-link__title {
  color: var(--docs-accent);
}

@media (min-width: 768px) {
  .docs-header__nav a.docs-header__cta {
    padding: 10px 24px;
    font-size: 15px;
  }
}

@media (max-width: 860px) {
  .docs-header__nav a:not(.docs-header__cta) {
    display: none;
  }

  .docs-rail,
  .docs-detail-rail {
    display: none;
  }
}
`;

export const DocsDesignStyles = (): JSX.Element => (
  <style>{docsDesignCss}</style>
);
