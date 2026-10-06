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
    expect(site.routes.map((route) => route.id)).toEqual(["home", "ask"]);
    expect(site.routes[0]?.path).toBe("/");
    expect(site.routes[0]?.sections).toEqual([
      {
        id: "work",
        template: "book:book-list",
        dataQuery: { entityType: "book", query: {} },
      },
    ]);
  });

  test("asks the brain on its own page, in the menu", () => {
    const ask = site.routes.find((route) => route.id === "ask");
    expect(ask?.path).toBe("/ask");
    expect(ask?.navigation).toMatchObject({ show: true, label: "Ask" });
    expect(ask?.sections).toEqual([
      { id: "ask", template: "book:ask", dataQuery: {} },
    ]);
  });

  test("cites only book sections in answers", () => {
    expect(site.entityDisplay["book"]?.citable).toBe(true);
    expect(
      Object.entries(site.entityDisplay)
        .filter(([, display]) => display.citable === true)
        .map(([type]) => type),
    ).toEqual(["book"]);
  });

  test("lists books on one page and keeps the generated index out of the menu", () => {
    expect(site.entityDisplay["book"]).toMatchObject({
      label: "Book",
      pluralName: "books",
      paginate: false,
      navigation: { show: false },
    });
  });

  test("renders topic pages as themes traced across the books", () => {
    expect(site.entityDisplay["topic"]).toMatchObject({
      label: "Theme",
      pluralName: "topics",
      detailTemplate: "book:theme",
      navigation: { show: true, slot: "primary" },
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
    expect(html).toMatch(/href="\/ask"[^>]*>Ask Friedrich</);
    expect(html).toContain("<main");
    expect(html).toContain("Abschnitt");
    expect(html).toContain("Text: eKGWB, Nietzsche Source");
  });

  test("drops the Ask pill on the Ask page itself", () => {
    const Layout = site.layouts["default"];
    if (!Layout) throw new Error("no default layout");
    const html = render(
      <Layout
        sections={[]}
        title="Ask"
        description=""
        path="/ask"
        siteInfo={siteInfo}
      />,
    );

    expect(html).not.toContain(">Ask Friedrich<");
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
