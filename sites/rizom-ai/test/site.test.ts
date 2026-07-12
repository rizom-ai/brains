import { describe, expect, test } from "bun:test";
import site from "../src";

describe("@rizom/site-rizom-ai", () => {
  test("exports a Rizom site definition for the AI site", () => {
    expect(site.layouts["default"]).toBeDefined();
    expect(site.routes.map((route) => route.id)).toEqual(["home"]);
    expect(site.routes[0]?.path).toBe("/");
    expect(site.content).toBeDefined();
  });

  test("owns the product theme profile declaratively", () => {
    expect(site.headScripts?.join("\n")).toContain(
      'data-theme-profile", "product"',
    );
  });

  test("exposes AI-specific route sections", () => {
    const route = site.routes[0];
    const sectionIds = route?.sections?.map((section) => section.id);

    expect(sectionIds).toEqual([
      "hero",
      "problem",
      "answer",
      "products",
      "ownership",
      "quickstart",
      "mission",
      "ecosystem",
    ]);
  });
});
