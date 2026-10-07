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

  test("draws the sky: substrate, dust, tendrils, a layered light per brain under its mark, Rizom's corona and lantern, grain", () => {
    const html = render({
      ...map,
      nodes: [
        ...map.nodes,
        {
          id: "team",
          name: "Rizom Core Team",
          kind: "team",
          status: "approved",
          tags: [],
          distance: 0.3,
          bearing: 200,
        },
        {
          id: "org",
          name: "Mindinn",
          kind: "organization",
          status: "approved",
          tags: [],
          distance: 0.58,
          bearing: 186,
        },
      ],
      pendingCount: 3,
      topics: [],
      askBox: true,
    });
    // One sky holds the drawing, the marks and the names, so they drift together.
    expect(html).toMatch(
      /<div class="net-layer" aria-hidden="true" data-ask-drawing=""><div class="net-sky"><svg class="net-svg" viewBox="0 0 100 100">/,
    );
    // The substrate, in this order: the boundary's purple, Rizom's wash, the dust.
    expect(html).toMatch(
      /<circle class="net-boundary"[^>]*><\/circle><circle class="net-wash"[^>]*><\/circle><g class="net-dust">(<circle[^>]*><\/circle>){3}<\/g>/,
    );
    // Tendrils: a trunk with its seep, then a branch per brain that the runtime lights as the brain's thread.
    expect(html).toMatch(
      /<g class="net-tendrils"><path class="net-trunk" d="M50 50 Q[^"]+"><\/path><path class="net-seep" d="M50 50 Q[^"]+"><\/path><path class="net-thread" data-brain="[^"]+" d="M[^"]+"><\/path>/,
    );
    expect(html).toMatch(
      /<path class="net-thread" data-brain="becca" d="M[^"]+"><\/path>/,
    );
    // A light per brain: an ember rim, a halo sized by nearness, a ripple and a bead on its route from Rizom.
    expect(html).toMatch(
      /<g class="net-reply" data-brain="team"[^>]*><circle class="net-rim"[^>]*><\/circle><circle class="net-halo"[^>]*><\/circle><circle class="net-ripple"[^>]*><\/circle><circle class="net-bead" r="0.7" style="[^"]*offset-path:path\(&quot;M50 50 Q[^)]+\)"><\/circle><\/g>/,
    );
    // Each reply carries its own clock: its breath, its phase and its turn on the shared cycle.
    expect(html).toContain(
      '<g class="net-reply" data-brain="team" style="--net-breath:8.6s;--net-phase:-3.4s;--net-turn:10.4s;--net-slot:2">',
    );
    expect(html).toMatch(
      /<g class="net-dust"><circle cx="[0-9.-]+" cy="[0-9.-]+" r="[0-9.]+" style="--net-breath:16s;--net-phase:0s"><\/circle>/,
    );
    expect(html).toMatch(
      /<g class="net-embers"><circle cx="[0-9.]+" cy="[0-9.]+" r="[0-9.]+" style="--net-phase:0s"><\/circle>/,
    );
    const halo = (id: string): number =>
      Number(
        html.match(
          new RegExp(
            `data-brain="${id}"[^>]*><circle class="net-rim"[^>]*></circle><circle class="net-halo"[^>]*r="([0-9.]+)"`,
          ),
        )?.[1],
      );
    expect(halo("team")).toBeGreaterThan(halo("becca"));
    // Rizom: the corona, seven embers, the lantern; grain over everything, fading at the edge.
    expect(html).toMatch(
      /<circle class="net-corona" cx="50" cy="50" r="13"><\/circle><g class="net-embers">(<circle[^>]*><\/circle>){7}<\/g><circle class="net-lantern" cx="50" cy="50" r="1.9"><\/circle><rect class="net-grain"[^>]*mask="url\(#net-fade\)"><\/rect><\/svg>/,
    );
    // The mark is the core, the hit target and the lead anchor; its kind is in its shape.
    expect(html).toContain(
      '<li class="net-mark" data-brain="becca" data-ask-mark="becca" data-kind="person"',
    );
    expect(html).toContain(
      '<li class="net-mark" data-brain="team" data-ask-mark="team" data-kind="team"',
    );
    expect(html).toContain(
      '<li class="net-mark" data-brain="org" data-ask-mark="org" data-kind="organization"',
    );
    expect(html).toMatch(
      /<a href="\/agents\/becca" aria-label="Becca"><i><\/i><\/a>/,
    );
    // Names carry no glyph; the shape does. Each sits below its light, aligned inward at the edges.
    expect(html).toMatch(
      /<li class="net-name" data-brain="becca"[^>]*>Becca<\/li>/,
    );
    expect(html).toMatch(
      /<li class="net-name net-name--start" data-brain="org"[^>]*>Mindinn<\/li>/,
    );
    // The radar is gone.
    for (const old of [
      "net-ring",
      "net-pulse",
      "net-echo",
      "net-spark",
      "net-kin net-",
      "net-corona--outer",
    ])
      expect(html).not.toContain(old);
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
