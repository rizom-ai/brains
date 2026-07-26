import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

  // The package ships raw `src/*.tsx`, transpiled live by the brain runtime,
  // which defaults to the React JSX runtime. Each JSX file must self-declare the
  // preact runtime via pragma or boot fails resolving `react/jsx-runtime`.
  it("declares the preact JSX runtime pragma in every shipped .tsx", () => {
    const srcDir = join(import.meta.dir, "..", "src");
    const tsxFiles = readdirSync(srcDir, { recursive: true }).filter(
      (entry): entry is string =>
        typeof entry === "string" && entry.endsWith(".tsx"),
    );
    expect(tsxFiles.length).toBeGreaterThan(0);
    for (const relativePath of tsxFiles) {
      const source = readFileSync(join(srcDir, relativePath), "utf8");
      expect(source.startsWith("/** @jsxImportSource preact */")).toBe(true);
    }
  });
});
