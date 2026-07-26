import { describe, expect, it } from "bun:test";
import { renderToString } from "preact-render-to-string";

import site, { CanaryHomeLayout, canaryMarker, canaryStatus } from "../src";

describe("smoke canary site package", () => {
  it("exports a minimal, content-independent SitePackage", () => {
    expect(site.layouts["default"]).toBeFunction();
    expect(site.plugin).toBeFunction();
    expect(
      (site.plugin() as unknown as { register?: unknown }).register,
    ).toBeFunction();
    // The canary owns no entity types — it must not depend on blog/decks/profile.
    expect(site.entityDisplay).toEqual({});
  });

  it("serves a single self-contained home route", () => {
    expect(site.routes).toHaveLength(1);
    const home = site.routes[0];
    expect(home?.path).toBe("/");
    const section = home?.sections?.[0];
    // Renders our own static template with inline content — no datasource query.
    expect(section?.template).toBe("smoke-canary-site:home");
    expect(section?.content).toEqual({});
  });

  it("ships a deterministic public canary marker", () => {
    expect(site.staticAssets?.["/.well-known/rover-site-canary.json"]).toBe(
      canaryMarker,
    );
    expect(JSON.parse(canaryMarker)).toEqual({
      package: "@rizom/site-smoke-canary",
      purpose: "hosted-external-package-canary",
      surface: "smoke.rizom.ai",
    });
  });

  it("exposes the built package version for on-page verification", () => {
    expect(canaryStatus.package).toBe("@rizom/site-smoke-canary");
    expect(canaryStatus.surface).toBe("smoke.rizom.ai");
    expect(canaryStatus.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("renders deterministic homepage content (not an empty page)", () => {
    const html = renderToString(CanaryHomeLayout({}));
    expect(html).toContain("@rizom/site-smoke-canary");
    expect(html).toContain(canaryStatus.version);
    expect(html.length).toBeGreaterThan(200);
  });
});
