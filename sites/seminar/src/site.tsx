import type { JSX } from "react";
import type {
  NavigationItem,
  RouteDefinitionInput,
  SiteDefinition,
  SiteLayoutProps,
} from "@rizom/site";

const routes: RouteDefinitionInput[] = [
  {
    id: "home",
    path: "/",
    title: "Seminars",
    description: "The seminars, newest first",
    layout: "default",
    navigation: {
      show: true,
      label: "Seminars",
      slot: "primary",
      priority: 10,
    },
    sections: [
      {
        id: "seminars",
        template: "seminar:seminar-list",
        dataQuery: { entityType: "seminar", query: {} },
      },
    ],
  },
  {
    id: "ask",
    path: "/ask",
    title: "Ask",
    description: "One question, put to all at once",
    layout: "default",
    navigation: { show: true, label: "Ask", slot: "primary", priority: 30 },
    sections: [{ id: "ask", template: "seminar:ask", dataQuery: {} }],
  },
];

/** A menu entry is current on its own page and, below the root, its subpages. */
function isCurrent(item: NavigationItem, path: string): boolean {
  if (item.href === "/") return path === "/" || path.startsWith("/seminars");
  return path === item.href || path.startsWith(`${item.href}/`);
}

/**
 * The brain's claim, set large on the home page. A word between asterisks
 * is the one it stresses.
 */
const Claim = ({ text }: { text: string }): JSX.Element => (
  <h1 className="seminar-claim">
    {text
      .split(/\*([^*]+)\*/u)
      .map((part, index) =>
        index % 2 === 1 ? <em key={index}>{part}</em> : part,
      )}
  </h1>
);

const SeminarLayout = ({
  sections,
  path,
  siteInfo,
}: SiteLayoutProps): JSX.Element => (
  <div className="seminar-site" lang="en">
    <header className="seminar-bar">
      <a className="seminar-mark" href="/">
        {siteInfo.title}
      </a>
      <nav className="seminar-nav" aria-label="Primary">
        {[...siteInfo.navigation.primary]
          .sort((a, b) => a.priority - b.priority)
          .map((item) => (
            <a
              key={item.href}
              href={item.href}
              aria-current={isCurrent(item, path) ? "page" : undefined}
            >
              {item.label}
            </a>
          ))}
        {/* The site engine switches data-theme on click and remembers it. */}
        <button
          type="button"
          className="seminar-theme"
          data-theme-toggle
          aria-label="Toggle dark mode"
        >
          <svg
            className="seminar-theme-sun"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
          </svg>
          <svg
            className="seminar-theme-moon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M20 14.6A8 8 0 0 1 9.4 4a8 8 0 1 0 10.6 10.6Z" />
          </svg>
        </button>
      </nav>
    </header>
    {path === "/" && siteInfo.description && (
      <Claim text={siteInfo.description} />
    )}
    <main className="seminar-main">{sections}</main>
    <footer className="seminar-foot">{siteInfo.copyright}</footer>
  </div>
);

/** The bar, the claim and the reading text, drawn from the theme's tokens only. */
const layoutCSS = `
.seminar-site { min-height: 100vh; display: flex; flex-direction: column; background: var(--color-bg); color: var(--color-text); }
.seminar-bar { display: flex; align-items: baseline; justify-content: space-between; gap: 1.5rem; padding: 1.6rem clamp(1.25rem, 4vw, 3rem) 0; flex-wrap: wrap; width: 100%; max-width: 82rem; margin: 0 auto; }
.seminar-mark { font-family: var(--font-heading); font-style: italic; font-weight: 500; font-size: 1.9rem; color: var(--color-heading); text-decoration: none; letter-spacing: -0.01em; }
.seminar-nav { display: flex; flex-wrap: wrap; align-items: center; column-gap: 1.75rem; row-gap: 0.5rem; font-family: var(--font-mono); font-size: var(--text-label-md); }
.seminar-nav a { color: var(--color-text-muted); text-decoration: none; padding-bottom: 3px; }
.seminar-nav a[aria-current="page"] { color: var(--color-text); border-bottom: 1.5px solid var(--color-accent); }
.seminar-theme { box-sizing: border-box; width: 2rem; height: 2rem; display: inline-flex; align-items: center; justify-content: center; padding: 0; background: none; border: 1px solid var(--color-rule-strong); color: var(--color-text); cursor: pointer; }
.seminar-theme:hover, .seminar-theme:focus-visible { border-color: var(--color-accent); color: var(--color-accent); outline: none; }
.seminar-theme svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.seminar-theme-sun, .seminar-theme-moon { display: none; }
[data-theme="dark"] .seminar-theme-sun { display: block; }
[data-theme="light"] .seminar-theme-moon { display: block; }
.seminar-claim { font-family: var(--font-heading); font-weight: 400; font-size: clamp(2.75rem, 7.4vw, 6.75rem); line-height: 0.94; letter-spacing: -0.03em; color: var(--color-heading); width: 100%; max-width: 82rem; margin: 0 auto; padding: clamp(3rem, 7vw, 5.5rem) clamp(1.25rem, 4vw, 3rem) clamp(1.75rem, 3vw, 2.5rem); text-wrap: balance; }
.seminar-claim em { font-style: italic; color: var(--color-accent); }
.seminar-main { flex: 1; }
.seminar-foot { font-family: var(--font-mono); font-size: var(--text-label-sm); color: var(--color-text-light); padding: 1.5rem clamp(1.25rem, 4vw, 3rem) 2rem; border-top: 1px solid var(--color-rule-strong); margin-top: 3rem; }
.seminar-voice { --tw-prose-body: var(--color-text); --tw-prose-headings: var(--color-text-muted); --tw-prose-bold: var(--color-text); --tw-prose-links: var(--color-accent); --tw-prose-quotes: var(--color-text); --tw-prose-quote-borders: var(--color-rule-strong); --tw-prose-counters: var(--color-text-muted); --tw-prose-bullets: var(--color-text-muted); color: var(--color-text); }
.seminar-site .seminar-voice p, .seminar-site .seminar-voice li, .seminar-site .seminar-voice blockquote { font-size: 1rem; line-height: 1.62; font-weight: 400; }
.seminar-site .seminar-voice > :first-child { margin-top: 0; }
.seminar-site .seminar-meet p { font-size: 1.125rem; line-height: 1.65; }
.seminar-site .seminar-voice p { margin: 0.9rem 0 0; }
.seminar-site .seminar-voice a { font-family: var(--font-mono); font-size: 0.75rem; color: var(--color-accent); text-decoration: none; border-bottom: 1px solid var(--color-accent-soft); white-space: nowrap; }
.seminar-site .seminar-voice a:hover { border-bottom-color: var(--color-accent); }
.seminar-site .seminar-voice blockquote { margin: 0.9rem 0 0; padding: 0 0 0 1rem; border-left: 2px solid var(--color-rule-strong); font-style: italic; }
.seminar-site .seminar-voice blockquote p::before, .seminar-site .seminar-voice blockquote p::after { content: none; }
.seminar-site .seminar-voice h1, .seminar-site .seminar-voice h2, .seminar-site .seminar-voice h3, .seminar-site .seminar-voice h4 { border: 0; padding: 0; font-family: var(--font-mono); font-size: var(--text-label-sm); font-weight: 400; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); margin: 1.2rem 0 0; }
.seminar-site .seminar-voice ul, .seminar-site .seminar-voice ol { margin: 0.9rem 0 0; padding-left: 1.2rem; }
`;

export const seminarSite: SiteDefinition = {
  layouts: { default: SeminarLayout },
  routes,
  entityDisplay: {
    // The home page lists the seminars; each opens at /seminars/<id>.
    seminar: {
      label: "Seminar",
      pluralName: "seminars",
      layout: "default",
      paginate: false,
      navigation: { show: false },
      citable: true,
    },
    // The brain's own notes on what its peers share.
    note: {
      label: "Note",
      pluralName: "notes",
      layout: "default",
      navigation: { show: true, slot: "primary", priority: 20 },
      citable: true,
    },
    // What a brain keeps beside its seminars has its pages and no place in
    // the menu: the menu is the seminars and the notes.
    link: { label: "Link", navigation: { show: false } },
    topic: { label: "Topic", navigation: { show: false } },
    agent: { label: "Agent", navigation: { show: false } },
    skill: { label: "Skill", navigation: { show: false } },
    summary: { label: "Summary", navigation: { show: false } },
  },
  themeOverride: layoutCSS,
};

export default seminarSite;
