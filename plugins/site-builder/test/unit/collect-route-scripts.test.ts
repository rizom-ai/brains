import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils";
import type { ViewTemplate } from "@brains/templates";
import type { RouteDefinition } from "@brains/plugins";
import type { BuildContext } from "../../src/lib/static-site-builder";
import { collectRouteScripts } from "../../src/lib/preact-builder";

/**
 * Build a tiny in-memory ViewTemplate stub. Only the fields the
 * collector touches (`name`, `runtimeScripts`, `schema`, `pluginId`,
 * `renderers`) are populated; everything else is left undefined.
 */
function makeTemplate(
  name: string,
  runtimeScripts?: ViewTemplate["runtimeScripts"],
): ViewTemplate {
  const tpl: ViewTemplate = {
    name,
    schema: z.object({}),
    pluginId: "test",
    renderers: { web: () => ({}) as never },
  };
  if (runtimeScripts) tpl.runtimeScripts = runtimeScripts;
  return tpl;
}

/**
 * Build a minimal BuildContext shaped just enough for collectRouteScripts.
 * Only `getViewTemplate` is consulted; everything else is set to noop / undefined.
 */
function makeContext(templates: Record<string, ViewTemplate>): BuildContext {
  return {
    routes: [],
    pluginContext: {} as never,
    siteConfig: { title: "T", description: "D" },
    getContent: async () => null,
    getViewTemplate: (name: string) => templates[name],
    layouts: {},
    getSiteInfo: async () => ({}) as never,
  };
}

function makeRoute(sectionTemplates: string[]): RouteDefinition {
  return {
    id: "home",
    path: "/",
    title: "Home",
    description: "Home",
    layout: "default",
    sections: sectionTemplates.map((template, i) => ({
      id: `s${i}`,
      template,
      content: {},
    })),
  };
}

describe("collectRouteScripts", () => {
  it("returns empty array when no template on the route declares runtimeScripts", () => {
    const ctx = makeContext({
      hero: makeTemplate("hero"),
      problem: makeTemplate("problem"),
    });
    const route = makeRoute(["hero", "problem"]);

    expect(collectRouteScripts(route, ctx)).toEqual([]);
  });

  it("emits a <script> tag for each runtimeScript on a used template", () => {
    const ctx = makeContext({
      hero: makeTemplate("hero"),
      products: makeTemplate("products", [
        { src: "/canvases/products.canvas.js", defer: true },
      ]),
    });
    const route = makeRoute(["hero", "products"]);

    const scripts = collectRouteScripts(route, ctx);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toBe(
      '<script src="/canvases/products.canvas.js" defer></script>',
    );
  });

  it("dedupes by src across templates and sections on the same route", () => {
    const ctx = makeContext({
      products: makeTemplate("products", [
        { src: "/canvases/products.canvas.js", defer: true },
      ]),
      // A different template that happens to declare the same script
      productsAlt: makeTemplate("productsAlt", [
        { src: "/canvases/products.canvas.js", defer: true },
      ]),
    });
    const route = makeRoute(["products", "productsAlt"]);

    const scripts = collectRouteScripts(route, ctx);
    expect(scripts).toHaveLength(1);
  });

  it("renders module + defer attributes correctly", () => {
    const ctx = makeContext({
      widget: makeTemplate("widget", [
        { src: "/widget.mjs", module: true, defer: true },
        { src: "/plain.js" },
      ]),
    });
    const route = makeRoute(["widget"]);

    const scripts = collectRouteScripts(route, ctx);
    expect(scripts).toContain(
      '<script src="/widget.mjs" defer type="module"></script>',
    );
    expect(scripts).toContain('<script src="/plain.js"></script>');
  });

  it("does not emit scripts from templates not used on this route", () => {
    const ctx = makeContext({
      hero: makeTemplate("hero"),
      products: makeTemplate("products", [
        { src: "/canvases/products.canvas.js", defer: true },
      ]),
    });
    // Route uses ONLY hero, not products
    const route = makeRoute(["hero"]);

    expect(collectRouteScripts(route, ctx)).toEqual([]);
  });
});
