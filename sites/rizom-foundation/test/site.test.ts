import { describe, expect, test } from "bun:test";
import site from "../src";

describe("@rizom/site-rizom-foundation", () => {
  test("exports a Rizom site definition for the Foundation site", () => {
    expect(site.layouts["default"]).toBeDefined();
    expect(site.routes.map((route) => route.id)).toEqual(["home"]);
    expect(site.routes[0]?.path).toBe("/");
    expect(site.content).toBeDefined();
    expect(site.themeOverride).toContain("color-foundation-meta-rule");
  });

  test("owns the editorial theme profile declaratively", () => {
    expect(site.headScripts?.join("\n")).toContain(
      'data-theme-profile", "editorial"',
    );
  });

  test("exposes Foundation-specific route sections", () => {
    const route = site.routes[0];
    const sectionIds = route?.sections?.map((section) => section.id);

    expect(sectionIds).toEqual([
      "hero",
      "pull-quote",
      "research",
      "events",
      "support",
      "ownership",
      "mission",
      "ecosystem",
    ]);
  });
});
