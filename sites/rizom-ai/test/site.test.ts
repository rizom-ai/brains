import { describe, expect, test } from "bun:test";
import site from "../src";

describe("@rizom/site-rizom-ai", () => {
  test("exports a Rizom site definition for the AI site", () => {
    expect(site.layouts["default"]).toBeDefined();
    expect(site.routes.map((route) => route.id)).toEqual([
      "home",
      "brain",
      "writing",
      "network",
      "work",
      "foundation",
    ]);
    expect(site.routes[0]?.path).toBe("/");
    // Every page is authored schema-first, so content travels via `sections`.
    const sections = Array.isArray(site.sections)
      ? site.sections
      : site.sections
        ? [site.sections]
        : [];
    expect(sections.map((group) => group.namespace)).toEqual([
      "home",
      "brain",
      "work",
      "foundation",
    ]);
  });

  test("exposes the /brain room — the product's own page", () => {
    const brain = site.routes.find((route) => route.id === "brain");
    expect(brain?.path).toBe("/brain");
    // The two pure-product sections move off the umbrella home page into the
    // room that owns the product story.
    expect(brain?.sections?.map((s) => s.id)).toEqual([
      "your-data",
      "quickstart",
    ]);
    expect(brain?.sections?.map((s) => s.template)).toEqual([
      "brain:your-data",
      "brain:quickstart",
    ]);
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

  test("ships boot.js but no theme-profile canvas", () => {
    const head = site.headScripts?.join("\n") ?? "";
    // boot.js drives the reveal/growth animations and must load.
    expect(head).toContain("/boot.js");
    // The rev-5 design draws its own motifs (mycelium rail, growth diagram);
    // the profile-driven background canvas and data-theme-profile attribute
    // are products-era machinery and must not ship.
    expect(head).not.toContain("data-theme-profile");
    expect(head).not.toContain("canvas");
  });

  test("opens the home page on the live agent proximity map", () => {
    const route = site.routes[0];
    const sectionIds = route?.sections?.map((section) => section.id);

    // The map is the hero; the text hero is gone. Order follows the redesign:
    // map → the dark (problem) → lights find each other (growth) → mission →
    // faces → colophon.
    expect(sectionIds).toEqual([
      "network",
      "problem",
      "growth",
      "mission",
      "faces",
      "alive",
    ]);

    // The opener is the agent-discovery datasource section; a dataQuery routes
    // it through the datasource (live map data) while its authored copy is
    // merged over via the content overlay.
    const network = route?.sections?.[0];
    expect(network?.template).toBe("agent-discovery:proximity-map");
    expect(network?.dataQuery).toBeDefined();
  });

  test("home body sections reference the home content namespace by string", () => {
    const templates = site.routes[0]?.sections?.map(
      (section) => section.template,
    );

    expect(templates).toEqual([
      "agent-discovery:proximity-map",
      "home:problem",
      "home:growth",
      "home:mission",
      "home:faces",
      "home:alive",
    ]);
  });
});
