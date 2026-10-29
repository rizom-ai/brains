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

  test("routes render the docs entity list template", () => {
    for (const route of site.routes) {
      expect(route.sections).toEqual([
        {
          id: "docs",
          template: "docs:doc-list",
          dataQuery: {
            entityType: "doc",
            query: { limit: 100 },
          },
        },
      ]);
    }
  });
});
