import { describe, expect, test } from "bun:test";
import { createElement as h } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { defineSite } from "@rizom/site";
import site from "../src";
import { DocsHomeDoors, DocsHomeHero, docsHomeSections } from "../src/home";
import { docsHomeContent } from "../src/home/content";

const docsQuery = { entityType: "doc", query: { limit: 100 } };

function route(id: string): (typeof site.routes)[number] | undefined {
  return site.routes.find((item) => item.id === id);
}

describe("@rizom/site-docs", () => {
  test("exports a docs site definition", () => {
    expect(site.layouts["default"]).toBeDefined();
    expect(site.routes.map((item) => item.id)).toEqual(["docs-home", "docs"]);
    expect(site.entityDisplay["doc"]?.pluralName).toBe("docs");
  });

  test("validates as a site", () => {
    expect(() => defineSite(site)).not.toThrow();
  });

  test("starts the opening and the doors from copy their sections accept", () => {
    const sections = docsHomeSections.sections;

    expect(
      sections["hero"]?.schema.safeParse(docsHomeContent.hero).success,
    ).toBe(true);
    expect(
      sections["doors"]?.schema.safeParse(docsHomeContent.doors).success,
    ).toBe(true);
  });

  test("displays each guide at /guides/<slug>, out of navigation for now", () => {
    expect(site.entityDisplay["guide"]).toEqual({
      label: "Guide",
      pluralName: "guides",
      layout: "default",
      paginate: false,
      navigation: { show: false },
    });
  });

  test("the home opens on the header, the brain, then the doors and their guides and docs", () => {
    expect(route("docs-home")?.sections).toEqual([
      { id: "header", template: "docs:doc-home-header", dataQuery: docsQuery },
      {
        id: "hero",
        template: "docs-home:hero",
        content: docsHomeContent.hero,
      },
      {
        id: "doors",
        template: "docs-home:doors",
        content: docsHomeContent.doors,
      },
      { id: "sections", template: "guides:guide-sections", dataQuery: {} },
    ]);
  });

  test("the docs index keeps the hero, the guides band and the sections", () => {
    expect(route("docs")?.sections).toEqual([
      { id: "docs-hero", template: "docs:doc-home-hero", dataQuery: docsQuery },
      {
        id: "guides",
        template: "guides:guide-band",
        dataQuery: { entityType: "guide", query: { limit: 100 } },
      },
      { id: "docs", template: "docs:doc-home-sections", dataQuery: docsQuery },
    ]);
  });

  test("serves the home's script as a file and loads it on every page", () => {
    expect(site.staticAssets?.["/scripts/docs-home.js"]).toContain(
      'getElementById("docs-home-brain")',
    );
    expect(site.headScripts).toContain(
      '<script src="/scripts/docs-home.js" defer></script>',
    );
  });
});

describe("the home's copy", () => {
  test("opens three doors, in the order of the docs sections", () => {
    expect(docsHomeContent.doors.doors.map((door) => door.title)).toEqual([
      "Use a brain",
      "Run a brain",
      "Extend a brain",
    ]);
  });
});

describe("DocsHomeHero", () => {
  const html = render(h(DocsHomeHero, docsHomeContent.hero));

  test("says what a brain is", () => {
    expect(html).toContain("A brain is one place for what you know.");
  });

  test("names every source, file and destination as a node with its route", () => {
    for (const story of ["draft", "pdf", "link", "photo"]) {
      expect(html).toContain(`data-story="${story}"`);
    }
    expect(html).toContain("on-slowness.md");
    expect(html).toContain("Your site and newsletter");
    expect(html).toContain('data-node="core"');
  });

  test("opens on the draft's route, with every route's caption at hand", () => {
    expect(html).toContain(docsHomeContent.hero.captions.draft);
    expect(html).toContain("data-captions=");
  });
});

describe("DocsHomeDoors", () => {
  const html = render(h(DocsHomeDoors, docsHomeContent.doors));

  test("gives each door its title and first step", () => {
    expect(html).toContain(">Run a brain</h3>");
    expect(html).toContain("brain init my-brain --recipe personal");
  });

  test("sets the code a step names in code", () => {
    expect(html).toContain("<code>brain.yaml</code>");
  });
});
