import { describe, expect, test } from "bun:test";
import site from "../src";

describe("@brains/site-rizom-work", () => {
  test("exports a Rizom site package for the work site", () => {
    expect(site.layouts["default"]).toBeDefined();
    expect(site.routes.map((route) => route.id)).toEqual(["home"]);
    expect(site.routes[0]?.path).toBe("/");
    expect(site.themeOverride).toContain("rizom-diagnostic-panel");
  });

  test("owns the studio theme profile in site plugin config", () => {
    const plugin = site.plugin();
    expect(plugin.id).toBe("rizom-site");
    expect(plugin.packageName).toBe("@brains/site-rizom-work");
    expect(plugin.config).toMatchObject({
      themeProfile: "studio",
    });
  });

  test("exposes work-specific route sections", () => {
    const route = site.routes[0];
    const sectionIds = route?.sections?.map((section) => section.id);

    expect(sectionIds).toEqual([
      "hero",
      "problem",
      "workshop",
      "credibility",
      "personas",
      "proof",
      "ownership",
      "mission",
      "ecosystem",
    ]);
  });
});
