/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "@rizom/site";
import { askRoomSchema, askRoomTemplate } from "../src/ask-room";

const componentSchema = z.custom<ComponentType<Record<string, unknown>>>(
  (value) => typeof value === "function",
);

const map = {
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
  ],
  clusters: [],
  sightings: [],
  distanceRange: { min: 0.58, max: 0.58 },
  pendingCount: 0,
};

function render(data: unknown): string {
  return renderToStaticMarkup(
    createElement(
      componentSchema.parse(askRoomTemplate.layout?.component),
      askRoomSchema.parse(data),
    ),
  );
}

describe("the Ask room on /ask", () => {
  test("is a public template over the opening's data, with its own words", () => {
    expect(askRoomTemplate.name).toBe("ask-room");
    expect(askRoomTemplate.dataSourceId).toBe("rizom:opening");
    expect(askRoomTemplate.requiredPermission).toBe("public");
    expect(askRoomTemplate.overlayFormatter).toBeDefined();
  });

  test("draws the network before the words, with the lead layer, and docks the box in the column", () => {
    const html = render({
      ...map,
      topics: ["What changes when a brain is yours?"],
      prompt: "What’s on your mind?",
      askBox: true,
    });
    // The room (@brains/contracts ask-box; the story is the room): the drawing
    // is lent to a phone's conversation, its dots are marks keyed by brain,
    // the room draws leads into the layer, and the words are the column that
    // scrolls beside the drawing.
    expect(html).toMatch(
      /^<div class="net-layer" aria-hidden="true" data-ask-drawing="">[^]*<\/div><svg class="net-leads" data-ask-leads="" aria-hidden="true"><\/svg><section id="ask" class="chapter chapter--opening" data-title="Ask"><div class="opening__words" data-ask-column="">/,
    );
    expect(html).toContain(
      'class="net-mark" data-brain="becca" data-ask-mark="becca"',
    );
    expect(html).toContain('<p class="eyebrow">Ask</p>');
    expect(html).toContain("<h1>Ask the network</h1>");
    expect(html).toContain('data-ask-box=""');
    expect(html).toContain(
      '<textarea rows="1" disabled="" aria-label="Your question" placeholder="What’s on your mind?">',
    );
    expect(html).toContain(
      '<button type="button" data-atlas-fill="What changes when a brain is yours?">What changes when a brain is yours?</button>',
    );
    expect(html).toContain(
      '<script src="/ask/assets/box.js" defer=""></script>',
    );
  });

  test("speaks the owner's authored words when the content gives them", () => {
    const html = render({
      ...map,
      topics: [],
      askBox: true,
      cap: "Questions",
      claim: "Ask what you like",
      body: "The connected brains answer.",
    });
    expect(html).toContain('<p class="eyebrow">Questions</p>');
    expect(html).toContain("<h1>Ask what you like</h1>");
    expect(html).toContain('<p class="lede">The connected brains answer.</p>');
  });
});
