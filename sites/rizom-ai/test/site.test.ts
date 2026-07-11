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

  test("exposes the home route sections in rev-5 order", () => {
    const route = site.routes[0];
    const sectionIds = route?.sections?.map((section) => section.id);

    expect(sectionIds).toEqual([
      "hero",
      "growth",
      "problem",
      "your-data",
      "quickstart",
      "mission",
      "faces",
      "alive",
    ]);
  });

  test("home sections reference the home content namespace by string", () => {
    const templates = site.routes[0]?.sections?.map(
      (section) => section.template,
    );

    expect(templates).toEqual([
      "home:hero",
      "home:growth",
      "home:problem",
      "home:your-data",
      "home:quickstart",
      "home:mission",
      "home:faces",
      "home:alive",
    ]);
  });
});
