import { describe, it, expect } from "bun:test";
import type { RouteDefinition } from "@brains/site-composition";
import {
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
