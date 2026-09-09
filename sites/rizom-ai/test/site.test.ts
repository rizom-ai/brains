import { describe, expect, test } from "bun:test";
import site from "../src";

describe("@rizom/site-rizom-ai", () => {
  test("exports a Rizom site definition for the AI site", () => {
    expect(site.layouts["default"]).toBeDefined();
    expect(site.routes.map((route) => route.id)).toEqual([
      "living-memory",
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
      "living-memory",
      "brain",
      "work",
      "foundation",
    ]);
  });

  test("exposes the Brain landing page with stable content IDs", () => {
    const brain = site.routes.find((route) => route.id === "brain");
    expect(brain?.path).toBe("/brain");
    // Answers, capabilities, collective work, ownership and starting points.
    // The closing CTA is folded into Quickstart; old closing content is retained unrouted.
    expect(brain?.sections?.map((s) => s.id)).toEqual([
      "hero",
      "capture",
      "ask",
      "connect",
      "run",
      "your-data",
      "quickstart",
    ]);
    expect(brain?.sections?.map((s) => s.template)).toEqual([
      "brain:hero",
      "brain:capture",
      "brain:ask",
      "brain:connect",
      "brain:run",
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

  test("ships boot.js exactly once, no theme-profile canvas", () => {
    const head = site.headScripts?.join("\n") ?? "";
    // boot.js drives the reveal/growth animations and must load — once.
    // A second copy double-binds #themeToggle and the theme toggle becomes
    // a per-click no-op (each click flips dark→light→dark).
    expect(head).toContain("/boot.js");
    expect(head.split("/boot.js").length - 1).toBe(1);
    // The rev-5 design draws its own motifs (mycelium rail, growth diagram);
    // no background canvas or profile attribute may ship in the head.
    expect(head).not.toContain("data-theme-profile");
    expect(head).not.toContain("canvas");
  });

  test("opens the home page on the live agent proximity map", () => {
    const route = site.routes[0];
    const sectionIds = route?.sections?.map((section) => section.id);

    // Keep the approved composition and its existing content identities.
    expect(sectionIds).toEqual([
      "hero",
      "problem",
      "science",
      "turn",
      "system",
      "growth",
      "proof",
      "arc",
      "doors",
    ]);

    // The opener is the agent-discovery datasource section; a dataQuery routes
    // it through the datasource (live map data) while its authored copy is
    // merged over via the content overlay. The knowledge map works the same
    // way through the topics plugin.
    const network = route?.sections?.[0];
    expect(network?.template).toBe("agent-discovery:proximity-map");
    expect(network?.dataQuery).toBeDefined();
    const knowledge = route?.sections?.find(
      (section) => section.id === "proof",
    );
    expect(knowledge?.template).toBe("topics:knowledge-map");
    expect(knowledge?.dataQuery).toBeDefined();
  });

  test("home body sections reference their content namespaces by string", () => {
    const templates = site.routes[0]?.sections?.map(
      (section) => section.template,
    );

    expect(templates).toEqual([
      "agent-discovery:proximity-map",
      "living-memory:problem",
      "living-memory:science",
      "living-memory:turn",
      "living-memory:system",
      "living-memory:growth",
      "topics:knowledge-map",
      "living-memory:arc",
      "living-memory:doors",
    ]);
  });
});
