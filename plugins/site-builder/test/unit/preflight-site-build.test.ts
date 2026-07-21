import { describe, expect, it } from "bun:test";
import type { RouteDefinition } from "@brains/site-composition";
import type { LayoutComponent } from "@brains/site-engine";
import { z } from "@brains/utils/zod";
import { h } from "preact";
import {
  formatSiteBuildDiagnostic,
  preflightSiteBuild,
} from "../../src/lib/preflight-site-build";
import type { SiteViewTemplate } from "../../src/lib/site-view-template";

const layout: LayoutComponent = ({ sections }) => h("main", {}, sections);

function route(overrides: Partial<RouteDefinition> = {}): RouteDefinition {
  return {
    id: "home",
    path: "/",
    title: "Home",
    description: "Home route",
    layout: "default",
    sections: [
      {
        id: "hero",
        template: "baseline:hero",
        content: { heading: "Hello" },
      },
    ],
    ...overrides,
  };
}

function template(overrides: Partial<SiteViewTemplate> = {}): SiteViewTemplate {
  return {
    name: "baseline:hero",
    schema: z.object({ heading: z.string() }),
    pluginId: "baseline",
    renderers: { web: () => h("section", {}, "Hello") },
    ...overrides,
  };
}

describe("preflightSiteBuild", () => {
  it("accepts safe routes, layouts, renderers, and assets", () => {
    const templates = { "baseline:hero": template() };

    const result = preflightSiteBuild({
      routes: [route({ path: "/writing/" })],
      layouts: { default: layout },
      getViewTemplate: (name) => templates[name as keyof typeof templates],
      staticAssets: {
        "/scripts/site.js": "console.log('safe');",
        "assets/site.txt": "safe",
      },
    });

    expect(result).toEqual({ diagnostics: [], errors: [], warnings: [] });
  });

  it("reports missing templates and non-callable web renderers as warnings", () => {
    const noWebRenderer = template({
      name: "baseline:no-web",
      renderers: { web: "compiled-template" },
    });
    const routes = [
      route({
        sections: [
          { id: "missing", template: "baseline:missing", content: {} },
          { id: "no-web", template: "baseline:no-web", content: {} },
        ],
      }),
    ];

    const result = preflightSiteBuild({
      routes,
      layouts: { default: layout },
      getViewTemplate: (name) =>
        name === "baseline:no-web" ? noWebRenderer : undefined,
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "missing-template",
        routeId: "home",
        sectionId: "missing",
        template: "baseline:missing",
      }),
      expect.objectContaining({
        severity: "warning",
        code: "missing-web-renderer",
        routeId: "home",
        sectionId: "no-web",
        template: "baseline:no-web",
      }),
    ]);
    const firstWarning = result.warnings[0];
    expect(firstWarning).toBeDefined();
    if (!firstWarning) throw new Error("Expected a preflight warning");
    expect(formatSiteBuildDiagnostic(firstWarning)).toStartWith(
      "[missing-template]",
    );
  });

  it("rejects unsafe output paths and missing layouts before rendering", () => {
    const unsafeTemplate = template({
      staticAssets: { "../template.js": "unsafe" },
    });

    const result = preflightSiteBuild({
      routes: [
        route({
          path: "/../outside",
          layout: "missing",
        }),
      ],
      layouts: { default: layout },
      getViewTemplate: () => unsafeTemplate,
      staticAssets: {
        "assets/../outside.txt": "unsafe",
        "\\windows\\outside.txt": "unsafe",
      },
    });

    expect(result.warnings).toEqual([]);
    expect(result.errors.map(({ code }) => code).sort()).toEqual([
      "missing-layout",
      "unsafe-route-path",
      "unsafe-static-asset-path",
      "unsafe-static-asset-path",
      "unsafe-static-asset-path",
    ]);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsafe-route-path",
          routeId: "home",
          path: "/../outside",
        }),
        expect.objectContaining({
          code: "missing-layout",
          routeId: "home",
        }),
        expect.objectContaining({
          code: "unsafe-static-asset-path",
          template: "baseline:hero",
          path: "../template.js",
        }),
      ]),
    );
  });
});
