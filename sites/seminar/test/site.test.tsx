/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import site from "../src";

const siteInfo = {
  title: "Suspicion",
  description: "One question. Three who *distrust* the answer.",
  copyright: "Every quote is an author's brain quoting its own books.",
  navigation: {
    primary: [
      { label: "Seminars", href: "/", priority: 10 },
      { label: "Notes", href: "/notes", priority: 20 },
    ],
    secondary: [],
  },
};

function page(path: string): string {
  const Layout = site.layouts["default"];
  if (!Layout) throw new Error("no default layout");
  return render(
    <Layout
      sections={[<p key="body">The page.</p>]}
      title="A page"
      description=""
      path={path}
      siteInfo={siteInfo}
    />,
  );
}

describe("@rizom/site-seminar", () => {
  test("opens on the seminars", () => {
    expect(site.routes.map((route) => route.id)).toEqual(["home"]);
    expect(site.routes[0]).toMatchObject({
      path: "/",
      navigation: { show: true, label: "Seminars" },
      sections: [
        {
          id: "seminars",
          template: "seminar:seminar-list",
          dataQuery: { entityType: "seminar", query: {} },
        },
      ],
    });
  });

  test("opens each seminar at /seminars/<id>, on one page, out of the menu", () => {
    expect(site.entityDisplay["seminar"]).toMatchObject({
      label: "Seminar",
      pluralName: "seminars",
      paginate: false,
      navigation: { show: false },
    });
  });

  test("puts the brain's notes in the menu", () => {
    expect(site.entityDisplay["note"]).toMatchObject({
      label: "Note",
      pluralName: "notes",
      navigation: { show: true, slot: "primary" },
    });
  });

  test("keeps everything else the brain holds out of the menu", () => {
    for (const type of ["link", "topic", "agent", "skill", "summary"]) {
      expect(site.entityDisplay[type]?.navigation).toEqual({ show: false });
    }
  });

  test("lets an answer cite seminars and notes, and nothing else", () => {
    expect(
      Object.entries(site.entityDisplay)
        .filter(([, display]) => display.citable === true)
        .map(([type]) => type)
        .sort(),
    ).toEqual(["note", "seminar"]);
  });

  test("names the brain and its menu on every page, the current entry marked", () => {
    const html = page("/seminars/what-is-religion");
    expect(html).toContain(">Suspicion<");
    expect(html).toContain('<a href="/" aria-current="page">Seminars</a>');
    expect(html).toContain('<a href="/notes">Notes</a>');
    expect(html).toContain("The page.");
    expect(html).toContain(
      "Every quote is an author&#x27;s brain quoting its own books.",
    );
  });

  test("opens the home page on the brain's claim, its stressed word set apart", () => {
    const html = page("/");
    expect(html).toContain("One question. Three who ");
    expect(html).toContain("<em>distrust</em>");
    expect(page("/notes")).not.toContain("<em>distrust</em>");
  });

  test("draws its frame from the theme's tokens alone", () => {
    expect(site.themeOverride).toContain("var(--color-accent)");
    expect(site.themeOverride).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });
});
