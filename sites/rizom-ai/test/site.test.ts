import { describe, expect, test } from "bun:test";
import site from "../src";

describe("@rizom/site-rizom-ai", () => {
  test("exports a Rizom site definition for the AI site", () => {
    expect(site.layouts["default"]).toBeDefined();
    expect(site.routes.map((route) => route.id)).toEqual([
      "home",
      "writing",
      "network",
      "work",
      "foundation",
    ]);
    expect(site.routes[0]?.path).toBe("/");
    expect(site.content).toBeDefined();
  });

  test("exposes the work and foundation room sections", () => {
    const byId = (id: string): (typeof site.routes)[number] | undefined =>
      site.routes.find((route) => route.id === id);

    expect(byId("work")?.sections?.map((s) => s.id)).toEqual([
      "hero",
      "problem",
      "workshop",
      "personas",
      "quotes",
      "roster",
      "closer",
    ]);
    expect(byId("foundation")?.sections?.map((s) => s.id)).toEqual([
      "hero",
      "research",
      "pullquote",
      "chapters",
      "support",
      "follow",
    ]);
  });

  test("writing + network compose the plugins' own list templates", () => {
    const byId = (id: string): (typeof site.routes)[number] | undefined =>
      site.routes.find((route) => route.id === id);

    expect(byId("writing")?.sections?.map((s) => s.template)).toEqual([
      "blog:post-list",
      "decks:deck-list",
    ]);
    expect(byId("network")?.sections?.[0]?.template).toBe(
      "agent-discovery:agent-list",
    );
  });

  test("labels entity-backed lists via entityDisplay", () => {
    expect(site.entityDisplay["post"]?.label).toBe("Essay");
    expect(site.entityDisplay["deck"]?.label).toBe("Talk");
    expect(site.entityDisplay["agent"]?.label).toBe("Agent");
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
