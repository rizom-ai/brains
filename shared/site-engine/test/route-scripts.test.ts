import { describe, it, expect } from "bun:test";
import type { RouteDefinition } from "@brains/site-composition";
import {
  collectRouteAssets,
  collectRouteScripts,
  type RouteScriptContext,
  type RouteScriptTemplate,
} from "../src/route-scripts";

function makeTemplate(
  runtimeScripts?: RouteScriptTemplate["runtimeScripts"],
): RouteScriptTemplate {
  return runtimeScripts ? { runtimeScripts } : {};
}

function makeContext(
  templates: Record<string, RouteScriptTemplate>,
): RouteScriptContext {
  return {
    getViewTemplate: (name: string) => templates[name],
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
      hero: makeTemplate(),
      problem: makeTemplate(),
    });
    const route = makeRoute(["hero", "problem"]);

    expect(collectRouteScripts(route, ctx)).toEqual([]);
  });

  it("emits a <script> tag for each runtimeScript on a used template", () => {
    const ctx = makeContext({
      hero: makeTemplate(),
      products: makeTemplate([
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
      products: makeTemplate([
        { src: "/canvases/products.canvas.js", defer: true },
      ]),
      // A different template that happens to declare the same script
      productsAlt: makeTemplate([
        { src: "/canvases/products.canvas.js", defer: true },
      ]),
    });
    const route = makeRoute(["products", "productsAlt"]);

    const scripts = collectRouteScripts(route, ctx);
    expect(scripts).toHaveLength(1);
  });

  it("renders module + defer attributes correctly", () => {
    const ctx = makeContext({
      widget: makeTemplate([
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
      hero: makeTemplate(),
      products: makeTemplate([
        { src: "/canvases/products.canvas.js", defer: true },
      ]),
    });
    // Route uses ONLY hero, not products
    const route = makeRoute(["hero"]);

    expect(collectRouteScripts(route, ctx)).toEqual([]);
  });
});

describe("collectRouteAssets", () => {
  it("gathers static assets only from templates used on the given routes", () => {
    const ctx = makeContext({
      hero: makeTemplate(),
      map: {
        runtimeScripts: [{ src: "/scripts/map.js", defer: true }],
        staticAssets: { "/scripts/map.js": "(function(){/* map */})();" },
      },
      unused: {
        staticAssets: { "/scripts/unused.js": "nope" },
      },
    });

    const assets = collectRouteAssets([makeRoute(["hero", "map"])], ctx);
    expect(assets).toEqual({ "/scripts/map.js": "(function(){/* map */})();" });
  });

  it("dedupes by path across routes with the first declaration winning", () => {
    const ctx = makeContext({
      map: { staticAssets: { "/scripts/shared.js": "first" } },
      mapAlt: { staticAssets: { "/scripts/shared.js": "second" } },
    });

    const assets = collectRouteAssets(
      [makeRoute(["map"]), makeRoute(["mapAlt"])],
      ctx,
    );
    expect(assets).toEqual({ "/scripts/shared.js": "first" });
  });

  it("returns an empty map when no used template declares assets", () => {
    const ctx = makeContext({ hero: makeTemplate() });
    expect(collectRouteAssets([makeRoute(["hero"])], ctx)).toEqual({});
  });
});
