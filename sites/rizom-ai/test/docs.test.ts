import { describe, expect, test } from "bun:test";
import site from "../src";

// docs.rizom.ai moves to rizom.ai (docs/plans/rizom-three-sites.md, Phase 3):
// the docs and guides plugins' own templates render the index at /docs and
// each doc and guide at /docs/<slug> and /guides/<slug>.
describe("the documentation on rizom.ai", () => {
  test("/docs is the docs index: its opening, the guides, then every section's docs", () => {
    const docs = site.routes.find((route) => route.path === "/docs");
    expect(docs?.sections?.map((section) => section.template)).toEqual([
      "docs:doc-home-hero",
      "guides:guide-band",
      "docs:doc-home-sections",
    ]);
    expect(docs?.navigation?.show).toBe(false);
  });

  test("each doc and guide has a page of its own, under /docs and /guides", () => {
    expect(site.entityDisplay["doc"]).toMatchObject({
      pluralName: "docs",
      layout: "default",
      paginate: false,
      navigation: { show: false },
    });
    expect(site.entityDisplay["guide"]).toMatchObject({
      pluralName: "guides",
      layout: "default",
      paginate: false,
      navigation: { show: false },
    });
  });

  test("a visitor's answer may cite a doc or a guide", () => {
    expect(site.entityDisplay["doc"]?.citable).toBe(true);
    expect(site.entityDisplay["guide"]?.citable).toBe(true);
  });
});

describe("a doc or guide page inside rizom.ai's chrome", () => {
  // The docs plugins' pages bring a footer with a theme toggle, which
  // docs.rizom.ai needs: its layout has neither. On rizom.ai the bar has the
  // toggle and the site footer follows, so the docs' own footer is hidden.
  test("shows rizom.ai's footer, not the docs' own", () => {
    expect(site.themeOverride).toMatch(
      /\.docs-handbook footer \{\s*display: none;\s*\}/,
    );
  });
});
