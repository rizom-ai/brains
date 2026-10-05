/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "@rizom/site";
import type { ProximityMapData } from "@brains/agent-discovery/proximity-map";
import { openingSchema, openingTemplate } from "../src/opening";

const componentSchema = z.custom<ComponentType<Record<string, unknown>>>(
  (value) => typeof value === "function",
);

const map: ProximityMapData = {
  center: { kind: "identity" },
  nodes: [
    {
      id: "becca",
      name: "Becca",
      kind: "person",
      status: "approved",
      tags: [],
      distance: 0.58,
      bearing: 120,
    },
    {
      id: "jo",
      name: "Jo",
      kind: "person",
      status: "approved",
      tags: [],
      distance: 0.48,
      bearing: 300,
    },
  ],
  clusters: [],
  sightings: [],
  distanceRange: { min: 0.48, max: 0.58 },
  pendingCount: 0,
  headingLevel: "h1",
  kicker: "Living memory",
  headingLead: "AI didn't break your knowledge system.",
  headingAccent: "It exposed that you never had one.",
  lede: "Rizom builds living memory for hybrid human–AI teams.",
  ctaLabel: "Book a knowledge session",
  ctaHref: "https://rizom.ai/work",
};

function render(data: unknown): string {
  return renderToStaticMarkup(
    createElement(
      componentSchema.parse(openingTemplate.layout?.component),
      openingSchema.parse(data),
    ),
  );
}

describe("the homepage opening", () => {
  test("is a public, datasource-backed template with the hero's copy overlay", () => {
    expect(openingTemplate.name).toBe("opening");
    expect(openingTemplate.dataSourceId).toBe("rizom:opening");
    expect(openingTemplate.requiredPermission).toBe("public");
    expect(openingTemplate.overlayFormatter).toBeDefined();
  });

  test("opens the story with the authored words over the live network, and a door", () => {
    const html = render(map);
    expect(html).toMatch(
      /^<section id="hero" class="chapter chapter--opening" data-title="Top">/,
    );
    expect(html).toContain('<p class="eyebrow">Living memory</p>');
    expect(html).toContain(
      "<h1>AI didn&#x27;t break your knowledge system. <em>It exposed that you never had one.</em></h1>",
    );
    expect(html).toContain(
      '<p class="lede">Rizom builds living memory for hybrid human–AI teams.</p>',
    );
    expect(html).toContain(
      '<a class="opening__door" href="https://rizom.ai/work">Book a knowledge session</a>',
    );
    // The opening's picture is the organism, one brain becoming a team and
    // a network, standing where the story's drawing stands and leaving with
    // the opening. The live network is drawn on /ask.
    expect(html).toContain('<div class="opening__art" aria-hidden="true">');
    expect(html).toContain('class="organism-map"');
    expect(html).toContain('<use href="#org-brain"');
    expect(html).toContain('<use href="#org-team"');
    expect(html).toContain('<use href="#org-network"');
    expect(html).not.toContain("net-mark");
    expect(html).not.toContain("net-pulse");
    // The Ask room lives on /ask (see ./ask-room); the opening carries none of it.
    expect(html).not.toContain("data-ask-box");
    expect(html).not.toContain("data-ask-column");
    expect(html).not.toContain("data-ask-leads");
    expect(html).not.toContain("data-ask-drawing");
  });

  test("keeps the words and the picture when the network is empty", () => {
    const html = render({ ...map, nodes: [] });
    expect(html).toContain("<h1>AI didn&#x27;t break");
    expect(html).toContain('class="organism-map"');
  });
});
