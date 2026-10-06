/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import site from "../src";

const siteInfo = {
  title: "Friedrich",
  description: "Nietzsche's works",
  copyright: "Text: eKGWB, Nietzsche Source",
  navigation: {
    primary: [{ label: "Work", href: "/", priority: 10 }],
    secondary: [],
  },
};

describe("@rizom/site-books", () => {
  test("opens on the book index", () => {
    expect(site.routes.map((route) => route.id)).toEqual(["home"]);
    expect(site.routes[0]?.path).toBe("/");
    expect(site.routes[0]?.sections).toEqual([
      {
        id: "work",
        template: "book:book-list",
        dataQuery: { entityType: "book", query: {} },
      },
    ]);
  });

  test("lists books on one page and keeps the generated index out of the menu", () => {
    expect(site.entityDisplay["book"]).toMatchObject({
      label: "Book",
      pluralName: "books",
      paginate: false,
      navigation: { show: false },
    });
  });

  test("frames every page with the brain's name and its navigation", () => {
    const Layout = site.layouts["default"];
    expect(Layout).toBeDefined();
    if (!Layout) return;
    const html = render(
      <Layout
        sections={[<p key="s">Abschnitt</p>]}
        title="Der Antichrist"
        description=""
        path="/books/der-antichrist"
        siteInfo={siteInfo}
      />,
    );

    expect(html).toContain("Friedrich");
    expect(html).toContain('href="/"');
    expect(html).toContain("Work");
    expect(html).toContain("Ask Friedrich");
    expect(html).toContain("<main");
    expect(html).toContain("Abschnitt");
    expect(html).toContain("Text: eKGWB, Nietzsche Source");
  });

  test("turns pages with the arrow keys, but not while typing", () => {
    const script = (site.headScripts ?? []).join("\n");

    expect(script).toContain("ArrowLeft");
    expect(script).toContain("ArrowRight");
    expect(script).toContain('a[rel="prev"]');
    expect(script).toContain('a[rel="next"]');
    expect(script).toMatch(/INPUT|isContentEditable/);
  });

  test("marks the current section of the site in the menu", () => {
    const Layout = site.layouts["default"];
    if (!Layout) return;
    const html = render(
      <Layout
        sections={[]}
        title=""
        description=""
        path="/"
        siteInfo={siteInfo}
      />,
    );

    expect(html).toContain('aria-current="page"');
  });
});
