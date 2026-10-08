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
    title: "Work",
    description: "The work as one horizon",
    layout: "default",
    navigation: { show: true, label: "Work", slot: "primary", priority: 10 },
    sections: [
      {
        id: "work",
        template: "book:book-list",
        dataQuery: { entityType: "book", query: {} },
      },
    ],
  },
  {
    id: "ask",
    path: "/ask",
    title: "Ask",
    description: "Answers from the work, citing every passage",
    layout: "default",
    navigation: { show: true, label: "Ask", slot: "primary", priority: 30 },
    sections: [{ id: "ask", template: "book:ask", dataQuery: {} }],
  },
];

/** A menu entry is current on its own page and, below the root, its subpages. */
function isCurrent(item: NavigationItem, path: string): boolean {
  if (item.href === "/") return path === "/" || path.startsWith("/books");
  return path === item.href || path.startsWith(`${item.href}/`);
}

const BooksLayout = ({
  sections,
  path,
  siteInfo,
}: SiteLayoutProps): JSX.Element => (
  <div className="books-site" lang="en">
    <header className="books-bar">
      <a className="books-mark" href="/">
        {siteInfo.title}
      </a>
      <nav className="books-nav" aria-label="Primary">
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
      </nav>
      {path !== "/ask" && (
        <a className="books-ask" href="/ask">
          Ask {siteInfo.title}
        </a>
      )}
    </header>
    <main className="books-main">{sections}</main>
    <footer className="books-foot">{siteInfo.copyright}</footer>
  </div>
);

/** The bar and frame, drawn from the theme's tokens only. */
const layoutCSS = `
.books-site { min-height: 100vh; display: flex; flex-direction: column; background: var(--color-bg); color: var(--color-text); }
.books-bar { display: flex; align-items: baseline; justify-content: space-between; gap: 1.5rem; padding: 1.6rem clamp(1rem, 4vw, 3rem) 0; flex-wrap: wrap; }
.books-mark { font-family: var(--font-heading); font-style: italic; font-weight: 500; font-size: 1.9rem; color: var(--color-heading); text-decoration: none; letter-spacing: -0.01em; }
.books-nav { display: flex; flex-wrap: wrap; column-gap: 1.75rem; row-gap: 0.5rem; font-family: var(--font-mono); font-size: var(--text-label-md); }
.books-nav a { color: var(--color-text-muted); text-decoration: none; padding-bottom: 3px; }
.books-nav a[aria-current="page"] { color: var(--color-text); border-bottom: 1.5px solid var(--color-accent); }
.books-ask { font-family: var(--font-mono); font-size: var(--text-label-md); color: var(--color-bg); background: var(--color-heading); padding: 0.45rem 0.9rem; text-decoration: none; }
.books-ask::before { content: "? "; color: var(--color-accent); font-weight: 700; }
.books-ask:hover { background: var(--color-accent); }
.books-ask:hover::before { color: var(--color-bg); }
.books-main { flex: 1; }
.books-foot { font-family: var(--font-mono); font-size: var(--text-label-sm); color: var(--color-text-light); padding: 2.5rem clamp(1rem, 4vw, 3rem); border-top: 1px solid var(--color-rule-strong); margin-top: 4rem; }
`;

/** ← and → follow the page's own prev/next links, unless the reader is typing. */
const pagingScript = `<script>
document.addEventListener("keydown", function (event) {
  var target = event.target;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
  var rel = event.key === "ArrowLeft" ? "prev" : event.key === "ArrowRight" ? "next" : null;
  if (!rel) return;
  var link = document.querySelector(rel === "prev" ? 'a[rel="prev"]' : 'a[rel="next"]');
  if (link) window.location.href = link.href;
});
</script>`;

export const booksSite: SiteDefinition = {
  layouts: { default: BooksLayout },
  routes,
  entityDisplay: {
    book: {
      label: "Book",
      pluralName: "books",
      layout: "default",
      paginate: false,
      navigation: { show: false },
      // Answers cite book sections, and nothing else.
      citable: true,
    },
    // A topic's page is its theme traced across the books; paths stay /topics.
    topic: {
      label: "Theme",
      pluralName: "topics",
      detailTemplate: "book:theme",
      navigation: { show: true, slot: "primary", priority: 20 },
    },
  },
  themeOverride: layoutCSS,
  headScripts: [pagingScript],
};

export default booksSite;
