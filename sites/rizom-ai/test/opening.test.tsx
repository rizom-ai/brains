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

  test("opens the story with the authored words over the live network", () => {
    const html = render({ ...map, topics: [], askBox: false });
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
    expect(html.match(/class="net-mark"/g)).toHaveLength(2);
    expect(html).toContain('<li class="net-name net-name--right"');
    expect(html).toContain(">Becca<");
    expect(html).toContain('class="net-pulse"');
    expect(html).not.toContain("data-ask-box");
  });

  test("docks the Ask box, disabled, with the drafted questions as topics", () => {
    const html = render({
      ...map,
      topics: ["What changes when a brain is yours?"],
      askBox: true,
      prompt: "What’s on your mind?",
    });
    expect(html).toContain('data-ask-box=""');
    expect(html).toContain(
      '<textarea rows="1" disabled="" aria-label="Your question" placeholder="What’s on your mind?">',
    );
    expect(html).toContain('data-ask-send=""');
    expect(html).toContain(
      '<button type="button" data-atlas-fill="What changes when a brain is yours?">What changes when a brain is yours?</button>',
    );
    expect(html).toContain(
      '<script src="/ask/assets/box.js" defer=""></script>',
    );
    expect(html).not.toContain('class="opening__door"');
    // The Ask room (@brains/contracts ask-box): the hero is the room, its
    // words the column that scrolls beside the drawing, the drawing is lent
    // to a phone's conversation, its dots are marks keyed by brain, and the
    // room draws leads into the layer.
    expect(html).toMatch(
      /^<section id="hero" class="chapter chapter--opening" data-title="Top" data-ask-room="">/,
    );
    expect(html).toContain('<div class="opening__words" data-ask-column="">');
    expect(html).toContain(
      '<div class="net-layer" aria-hidden="true" data-ask-drawing="">',
    );
    expect(html).toContain(
      'class="net-mark" data-brain="becca" data-ask-mark="becca"',
    );
    expect(html).toContain(
      '<svg class="net-leads" data-ask-leads="" aria-hidden="true">',
    );
  });

  test("without the box, the opening is no room: no column, no lead layer, and the drawing stays", () => {
    const html = render({ ...map, topics: [], askBox: false });
    expect(html).not.toContain("data-ask-room");
    expect(html).not.toContain("data-ask-column");
    expect(html).not.toContain("data-ask-leads");
    expect(html).not.toContain("data-ask-drawing");
  });

  test("keeps the words when the network is empty", () => {
    const html = render({ ...map, nodes: [], topics: [], askBox: false });
    expect(html).toContain("<h1>AI didn&#x27;t break");
    expect(html).not.toContain("net-mark");
    expect(html).not.toContain("net-pulse");
  });
});
