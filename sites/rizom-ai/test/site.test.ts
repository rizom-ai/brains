import { describe, expect, test } from "bun:test";
import site from "../src";
import { rizomRuntimeStaticAssets } from "../src/rizom/runtime/plugin";

describe("@rizom/site-rizom-ai", () => {
  test("exports a Rizom site definition for the AI site", () => {
    expect(site.layouts["default"]).toBeDefined();
    expect(site.routes.map((route) => route.id)).toEqual([
      "living-memory",
      "brain",
      "public-ask",
      "writing",
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
      "living-memory",
      "brain",
      "work",
      "foundation",
    ]);
  });

  test("exposes the Brain landing page with stable content IDs", () => {
    const brain = site.routes.find((route) => route.id === "brain");
    expect(brain?.path).toBe("/brain");
    // Told as a story beside its drawing: answers, capabilities, you, team
    // and network, the collective, ownership and starting points. The old
    // closing content is retained unrouted.
    expect(brain?.sections?.map((s) => s.id)).toEqual([
      "hero",
      "capture",
      "ask",
      "run",
      "connect",
      "your-data",
      "quickstart",
    ]);
    expect(brain?.sections?.map((s) => s.template)).toEqual([
      "brain:hero",
      "brain:capture",
      "brain:ask",
      "brain:run",
      "brain:connect",
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

  test("writing is one archive over the essays and presentations; the network page is gone", () => {
    const byId = (id: string): (typeof site.routes)[number] | undefined =>
      site.routes.find((route) => route.id === id);

    expect(byId("writing")?.sections).toEqual([
      { id: "archive", template: "rizom:writing", dataQuery: {} },
    ]);
    expect(byId("network")).toBeUndefined();
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

  test("opens the home page on the story, its live network first", () => {
    const route = site.routes[0];
    // The opening keeps the hero's content identity; the rest of the story
    // keeps its section ids. The problem, the system and the proof are told
    // on /work, /brain and by the opening itself.
    expect(route?.sections?.map((section) => section.id)).toEqual([
      "hero",
      "science",
      "turn",
      "growth",
      "arc",
      "doors",
    ]);
    const opening = route?.sections?.[0];
    expect(opening?.template).toBe("rizom:opening");
    expect(opening?.dataQuery).toBeDefined();
    // The Ask room and "Asked before" live on /ask: the box beside the live
    // network, then the published FAQs through the site's own datasource.
    const ask = site.routes.find((route) => route.path === "/ask");
    expect(
      ask?.sections?.map((section) => [section.id, section.template]),
    ).toEqual([
      ["ask", "rizom:ask-room"],
      ["asked", "rizom:asked"],
    ]);
    expect(ask?.layout).toBe("default");
    expect(ask?.sections?.every((section) => section.dataQuery)).toBe(true);
  });

  test("home body sections reference their content namespaces by string", () => {
    const templates = site.routes[0]?.sections?.map(
      (section) => section.template,
    );

    expect(templates).toEqual([
      "rizom:opening",
      "living-memory:science",
      "living-memory:turn",
      "living-memory:growth",
      "living-memory:arc",
      "living-memory:doors",
    ]);
  });
});

describe("the site's icon", () => {
  test("is the lantern, brass on night, served where every page's head points", () => {
    const icon = rizomRuntimeStaticAssets["/favicon.svg"];
    expect(icon).toStartWith("<svg");
    expect(icon).toContain('fill="#14132b"');
    expect(icon).toContain("#d4af37");
  });
});

describe("what a visitor's answer may cite", () => {
  test("names the network's pieces beside the site's own, all opted in", () => {
    expect(site.entityDisplay["network-piece"]).toMatchObject({
      label: "From the network",
      citable: true,
      navigation: { show: false },
    });
    for (const type of ["post", "deck", "agent"]) {
      expect(site.entityDisplay[type]?.citable).toBe(true);
    }
  });
});
