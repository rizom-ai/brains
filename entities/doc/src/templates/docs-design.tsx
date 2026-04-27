import type { JSX } from "preact";
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

export const DocsHeader = ({
  ecosystemHref = "/docs#ecosystem",
}: DocsHeaderProps): JSX.Element => (
  <nav className="docs-header">
    <a href="/docs" className="docs-header__wordmark" aria-label="Brains docs">
      <span className="docs-wordmark__ink">brains</span>
      <span className="docs-wordmark__dot">.</span>
      <span className="docs-wordmark__suffix">docs</span>
    </a>
    <div className="docs-header__nav">
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
  <section className="docs-ecosystem" id="ecosystem">
    <div className="docs-ecosystem__head">
      <span className="docs-ecosystem__eyebrow">The Ecosystem</span>
      <h2>
        One ecosystem. The <em>platform</em>, the <em>vision</em>, the{" "}
        <em>network</em>.
      </h2>
    </div>
    <div className="docs-ecosystem__cards">
      <a className="docs-ecosystem__card" href="https://rizom.ai">
        <span className="docs-ecosystem__wordmark">
          rizom<span className="docs-wordmark__dot">.</span>
          <span className="docs-wordmark__suffix">ai</span>
        </span>
        <span className="docs-ecosystem__role docs-ecosystem__role--ai">
          The platform
        </span>
        <p>
          Open-source AI agents built from your own knowledge. The tools that
          make everything else possible.
        </p>
        <span className="docs-ecosystem__link">See the platform →</span>
      </a>
      <a className="docs-ecosystem__card" href="https://rizom.foundation">
        <span className="docs-ecosystem__wordmark">
          rizom<span className="docs-wordmark__dot">.</span>
          <span className="docs-wordmark__suffix">foundation</span>
        </span>
        <span className="docs-ecosystem__role docs-ecosystem__role--foundation">
          The vision
        </span>
        <p>
          Essays, principles, and community. Why we believe knowledge work
          should be distributed, owned, and playful.
        </p>
        <span className="docs-ecosystem__link">Read the manifesto →</span>
      </a>
      <a className="docs-ecosystem__card" href="https://rizom.work">
        <span className="docs-ecosystem__wordmark">
          rizom<span className="docs-wordmark__dot">.</span>
          <span className="docs-wordmark__suffix">work</span>
        </span>
        <span className="docs-ecosystem__role docs-ecosystem__role--work">
          The network
        </span>
        <p>
          Distributed consultancy powered by brains. Specialized expertise that
          mobilizes in hours, not months.
        </p>
        <span className="docs-ecosystem__link">Work with us →</span>
      </a>
    </div>
  </section>
);

export const DocsFooter = (): JSX.Element => (
  <footer className="docs-footer">
    <a href="https://rizom.ai" className="docs-footer__wordmark">
      <span className="docs-wordmark__ink">rizom</span>
      <span className="docs-wordmark__dot">.</span>
      <span className="docs-wordmark__suffix">ai</span>
    </a>
    <div className="docs-footer__links">
      <a href="/docs/roadmap">Roadmap</a>
      <a href="https://github.com/rizom-ai/brains">GitHub</a>
      <a href="https://rizom.ai">Rizom</a>
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
  min-height: 100vh;
  color: var(--docs-text);
  background: transparent;
  font-family: var(--docs-font-body);
}

.docs-handbook a {
  color: inherit;
  text-decoration: none;
}

.docs-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--docs-bg) 95%, transparent) 0%,
    color-mix(in srgb, var(--docs-bg) 0%, transparent) 100%
  );
  backdrop-filter: blur(8px);
}

.docs-header__wordmark,
.docs-footer__wordmark {
  font-family: var(--docs-font-body);
  font-size: 20px;
  font-weight: 700;
}

.docs-wordmark__ink {
  color: var(--docs-text);
  font-weight: 700;
}

.docs-wordmark__dot {
  color: var(--docs-accent);
  font-weight: 700;
}

.docs-wordmark__suffix {
  color: var(--docs-text-muted);
}

.docs-header__nav {
  display: flex;
  align-items: center;
  gap: 32px;
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

.docs-wrap {
  max-width: var(--layout-max-width, 72rem);
  margin: 0 auto;
  padding: 96px 48px 0;
}

.docs-hero {
  padding: 96px 0 72px;
  border-bottom: 1px solid var(--docs-text);
}

.docs-hero__eyebrow,
.docs-label {
  font-family: var(--docs-font-label);
  font-size: var(--docs-label-sm);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--docs-accent);
}

.docs-hero__eyebrow {
  margin: 0 0 32px;
}

.docs-hero h1,
.docs-article__title,
.docs-chapter__title,
.docs-doc__title {
  font-family: var(--docs-font-display);
  font-weight: 400;
  color: var(--docs-heading);
}

.docs-hero h1 {
  font-size: var(--docs-display-lg);
  line-height: 1.05;
  letter-spacing: -0.02em;
  margin: 0;
  max-width: 16ch;
}

.docs-hero h1 em,
.docs-article__title em {
  color: var(--docs-accent);
  font-style: italic;
}

.docs-hero__intro {
  font-size: var(--docs-body-lg);
  line-height: 1.65;
  color: var(--docs-text-muted);
  max-width: 52ch;
  margin: 32px 0 0;
}

.docs-hero__meta {
  margin: 56px 0 0;
  display: flex;
  gap: 48px;
  font-family: var(--docs-font-label);
  font-size: var(--docs-label-sm);
  letter-spacing: 0.06em;
  color: var(--docs-text-light);
  flex-wrap: wrap;
}

.docs-hero__meta div {
  margin: 0;
}

.docs-hero__meta strong {
  color: var(--docs-text);
  font-weight: 500;
  display: block;
  margin-bottom: 2px;
}

.docs-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 36px;
}

.docs-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid var(--docs-text);
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.docs-button:hover {
  color: var(--docs-accent);
  border-color: var(--docs-accent);
}

.docs-button--primary {
  border-color: var(--docs-accent);
  background: var(--docs-accent);
  color: #fff;
}

.docs-button--primary:hover {
  background: transparent;
  color: var(--docs-accent);
}

.docs-library {
  padding: 80px 0 120px;
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 80px;
  align-items: start;
}

.docs-rail {
  position: sticky;
  top: 32px;
  font-family: var(--docs-font-label);
  font-size: var(--docs-label-sm);
  letter-spacing: 0.06em;
  color: var(--docs-text-light);
}

.docs-rail__heading {
  color: var(--docs-text);
  font-weight: 500;
  margin: 0 0 14px;
}

.docs-rail ol {
  list-style: none;
  margin: 0;
  padding: 0;
}

.docs-rail li {
  padding: 6px 0;
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 8px;
}

.docs-rail__num {
  font-family: var(--docs-font-display);
  font-style: italic;
  color: var(--docs-text-light);
  font-size: var(--docs-body-sm);
}

.docs-rail a {
  color: var(--docs-text-muted);
}

.docs-rail a:hover,
.docs-rail a[aria-current="page"] {
  color: var(--docs-accent);
}

.docs-chapter {
  margin-bottom: 64px;
}

.docs-chapter:last-child {
  margin-bottom: 0;
}

.docs-chapter__head {
  display: grid;
  grid-template-columns: 48px auto 1fr auto;
  align-items: baseline;
  column-gap: 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--docs-border);
  margin-bottom: 8px;
}

.docs-chapter__numeral {
  font-family: var(--docs-font-display);
  font-style: italic;
  font-size: var(--docs-display-sm);
  line-height: 1.1;
  color: var(--docs-accent);
  text-align: right;
}

.docs-chapter__title {
  font-size: var(--docs-display-sm);
  line-height: 1.1;
  letter-spacing: -0.015em;
  margin: 0;
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

.docs-chapter__count {
  font-family: var(--docs-font-label);
  font-size: var(--docs-label-sm);
  letter-spacing: 0.06em;
  color: var(--docs-text-light);
}

.docs-chapter__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.docs-chapter__list li {
  border-bottom: 1px solid var(--docs-border-light);
}

.docs-chapter__list li:last-child {
  border-bottom: none;
}

.docs-chapter__list a {
  display: block;
  padding: 18px 0 18px 68px;
}

.docs-doc__title {
  font-size: 22px;
  line-height: 1.2;
  letter-spacing: -0.005em;
  margin: 0;
  transition: color 0.15s;
}

.docs-doc__desc {
  font-size: var(--docs-body-sm);
  line-height: 1.55;
  color: var(--docs-text-muted);
  margin: 5px 0 0;
  max-width: 70ch;
}

.docs-chapter__list a:hover .docs-doc__title {
  color: var(--docs-accent);
}

.docs-detail-wrap {
  padding-top: 64px;
}

.docs-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  color: var(--docs-text-light);
  font-family: var(--docs-font-label);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.docs-breadcrumb a:hover {
  color: var(--docs-accent);
}

.docs-detail-grid {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 72px;
  align-items: start;
  padding: 48px 0 96px;
}

.docs-detail-rail {
  position: sticky;
  top: 32px;
  max-height: calc(100vh - 64px);
  overflow: auto;
  padding-right: 6px;
}

.docs-detail-rail .docs-rail {
  position: static;
}

.docs-detail-rail ol ol {
  margin-top: 2px;
}

.docs-detail-rail li {
  grid-template-columns: 1fr;
  padding: 0;
}

.docs-detail-rail .docs-rail__section {
  margin: 0 0 18px;
}

.docs-detail-rail .docs-rail__section-title {
  display: block;
  margin: 0 0 8px;
  color: var(--docs-text);
  font-weight: 500;
}

.docs-detail-rail .docs-rail__doc {
  display: block;
  padding: 5px 0 5px 18px;
  border-left: 1px solid var(--docs-border-light);
  font-family: var(--docs-font-body);
  font-size: 14px;
  line-height: 1.35;
  letter-spacing: 0;
  color: var(--docs-text-muted);
}

.docs-detail-rail .docs-rail__doc:hover,
.docs-detail-rail .docs-rail__doc[aria-current="page"] {
  color: var(--docs-accent);
  border-left-color: var(--docs-accent);
}

.docs-article {
  min-width: 0;
}

.docs-article__header {
  padding: 0 0 42px;
  border-bottom: 1px solid var(--docs-text);
}

.docs-article__kicker {
  margin: 0 0 24px;
}

.docs-article__title {
  font-size: var(--docs-display-md);
  line-height: 1.04;
  letter-spacing: -0.02em;
  margin: 0;
  max-width: 15ch;
}

.docs-article__desc {
  margin: 26px 0 0;
  max-width: 60ch;
  color: var(--docs-text-muted);
  font-size: var(--docs-body-lg);
  line-height: 1.65;
}

.docs-article__body {
  padding: 40px 0 20px;
  color: var(--docs-text-muted);
}

.docs-article__body article {
  color: var(--docs-text-muted);
  font-family: var(--docs-font-body);
  font-size: var(--docs-body-md);
  line-height: 1.75;
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
  font-size: clamp(28px, 3vw, 42px);
  line-height: 1.1;
  margin: 56px 0 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--docs-border);
}

.docs-article__body h3 {
  font-size: clamp(22px, 2vw, 30px);
  margin: 40px 0 12px;
}

.docs-article__body p,
.docs-article__body li {
  color: var(--docs-text-muted);
}

.docs-article__body a {
  color: var(--docs-accent-bright);
  border-bottom: 1px solid color-mix(in srgb, var(--docs-accent-bright) 45%, transparent);
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

.docs-article__footer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 48px;
  padding-top: 28px;
  border-top: 1px solid var(--docs-border);
}

.docs-ecosystem {
  padding: 112px 0 72px;
  border-top: 1px solid var(--docs-border-light);
}

.docs-ecosystem__head {
  text-align: center;
  margin-bottom: 56px;
}

.docs-ecosystem__eyebrow {
  color: var(--docs-accent);
  font-family: var(--docs-font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

.docs-ecosystem__head h2 {
  margin: 16px 0 0;
  color: var(--docs-heading);
  font-family: var(--docs-font-display);
  font-size: clamp(34px, 4.4vw, 60px);
  font-weight: 380;
  line-height: 1.04;
  letter-spacing: -0.02em;
}

.docs-ecosystem__head h2 em {
  color: var(--docs-accent);
  font-style: italic;
}

.docs-ecosystem__cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 56px;
}

.docs-ecosystem__card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  border-top: 1px solid var(--docs-border-light);
  padding-top: 28px;
  transition: border-color 0.2s;
}

.docs-ecosystem__card:hover {
  border-top-color: var(--docs-accent);
}

.docs-ecosystem__wordmark {
  color: var(--docs-text);
  font-family: var(--docs-font-display);
  font-size: clamp(28px, 3vw, 40px);
  font-weight: 400;
  line-height: 1.1;
}

.docs-ecosystem__role {
  margin-top: 4px;
  font-family: var(--docs-font-label);
  font-size: 10.5px;
  letter-spacing: 0.26em;
  text-transform: uppercase;
}

.docs-ecosystem__role--ai {
  color: var(--docs-accent-bright);
}

.docs-ecosystem__role--foundation {
  color: var(--docs-text-muted);
}

.docs-ecosystem__role--work {
  color: var(--docs-accent);
}

.docs-ecosystem__card p {
  margin: 8px 0 0;
  color: var(--docs-text-muted);
  font-size: 15px;
  line-height: 1.6;
}

.docs-ecosystem__link {
  align-self: flex-start;
  margin-top: 18px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--docs-border);
  color: var(--docs-text-muted);
  font-family: var(--docs-font-label);
  font-size: 10.5px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  transition: color 0.15s;
}

.docs-ecosystem__card:hover .docs-ecosystem__link {
  color: var(--docs-text);
}

.docs-footer {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 32px 0;
  border-top: 1px solid var(--docs-border-light);
  text-align: center;
}

.docs-footer__wordmark {
  font-size: 15px;
}

.docs-footer__links a,
.docs-footer__toggle {
  color: var(--docs-text-light);
  font-family: var(--docs-font-label);
  font-size: 13px;
}

.docs-footer__links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.docs-footer__links a {
  transition: color 0.15s;
}

.docs-footer__links a:hover {
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

.docs-page-link {
  border-top: 1px solid var(--docs-border-light);
  padding-top: 18px;
  transition: border-color 0.15s;
}

.docs-page-link:hover {
  border-top-color: var(--docs-accent);
}

.docs-page-link--next {
  text-align: right;
}

.docs-page-link__label {
  display: block;
  font-family: var(--docs-font-label);
  font-size: 10.5px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--docs-text-light);
}

.docs-page-link__title {
  display: block;
  margin-top: 8px;
  color: var(--docs-heading);
  font-family: var(--docs-font-display);
  font-size: 22px;
  line-height: 1.2;
}

.docs-page-link:hover .docs-page-link__title {
  color: var(--docs-accent);
}

@media (min-width: 768px) {
  .docs-header {
    padding: 20px 40px;
  }

  .docs-header__nav a.docs-header__cta {
    padding: 10px 24px;
    font-size: 15px;
  }

  .docs-footer {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 24px 0;
    text-align: left;
  }

  .docs-footer__links {
    justify-content: flex-end;
  }
}

@media (min-width: 1280px) {
  .docs-header {
    padding-left: 80px;
    padding-right: 80px;
  }
}

@media (max-width: 860px) {
  .docs-header__nav {
    gap: 16px;
  }

  .docs-header__nav a:not(.docs-header__cta) {
    display: none;
  }

  .docs-wrap {
    padding: 80px 24px 0;
  }

  .docs-hero {
    padding: 56px 0 48px;
  }

  .docs-hero__meta {
    gap: 28px;
    margin-top: 40px;
  }

  .docs-library,
  .docs-detail-grid {
    grid-template-columns: 1fr;
    gap: 40px;
    padding: 48px 0 80px;
  }

  .docs-rail,
  .docs-detail-rail {
    display: none;
  }

  .docs-chapter__head {
    grid-template-columns: 36px auto 1fr auto;
    column-gap: 12px;
  }

  .docs-chapter__list a {
    padding-left: 48px;
  }

  .docs-article__footer {
    grid-template-columns: 1fr;
  }

  .docs-page-link--next {
    text-align: left;
  }

  .docs-ecosystem {
    padding: 72px 0 48px;
  }

  .docs-ecosystem__cards {
    grid-template-columns: 1fr;
    gap: 28px;
  }
}
`;

export const DocsDesignStyles = (): JSX.Element => (
  <style>{docsDesignCss}</style>
);
