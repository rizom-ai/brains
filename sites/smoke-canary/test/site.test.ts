import { describe, expect, it } from "bun:test";

import site, { canaryMarker } from "../src";

describe("smoke canary site package", () => {
  it("exports a complete public SitePackage", () => {
    expect(site.layouts["default"]).toBeFunction();
    expect(site.routes.length).toBeGreaterThan(0);
    expect(site.plugin).toBeFunction();
    expect(
      (site.plugin() as unknown as { register?: unknown }).register,
    ).toBeFunction();
    expect(site.entityDisplay["post"]).toEqual({
      label: "Signal",
      pluralName: "signals",
    });
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
});
