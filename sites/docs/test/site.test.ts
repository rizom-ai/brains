import { describe, expect, test } from "bun:test";
import site from "../src";

describe("@rizom/site-docs", () => {
  test("exports a docs site definition", () => {
    expect(site.layouts["default"]).toBeDefined();
    expect(site.routes.map((route) => route.id)).toEqual(["docs-home", "docs"]);
    expect(site.entityDisplay["doc"]?.pluralName).toBe("docs");
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

  test("the docs home sets the guides band between its hero and its sections", () => {
    for (const route of site.routes) {
      expect(route.sections).toEqual([
        {
          id: "docs-hero",
          template: "docs:doc-home-hero",
          dataQuery: { entityType: "doc", query: { limit: 100 } },
        },
        {
          id: "guides",
          template: "guides:guide-band",
          dataQuery: { entityType: "guide", query: { limit: 100 } },
        },
        {
          id: "docs",
          template: "docs:doc-home-sections",
          dataQuery: { entityType: "doc", query: { limit: 100 } },
        },
      ]);
    }
  });
});
