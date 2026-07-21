/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import { render } from "preact-render-to-string";
import { KnowledgeMapTemplate } from "../../src/templates/knowledge-map-template";
import type { KnowledgeMapTemplateData } from "../../src/templates/knowledge-map-template";
import { getKnowledgeMapTemplate } from "../../src/templates/knowledge-map-template";
import { KnowledgeMapDataSource } from "../../src/datasources/knowledge-map-datasource";

/* The knowledge-map site template. The proof
   section — authored copy on the left, the live map on the right, honest
   counts and proof links in the foot. Copy is overlay-authored like the
   proximity hero; the map payload comes from the datasource. */

const data: KnowledgeMapTemplateData = {
  zones: [
    {
      id: "future-of-work",
      name: "Future of Work",
      x: 0.3,
      y: 0.3,
      memberIds: ["play-essay"],
    },
  ],
  points: [
    {
      id: "play-essay",
      entityType: "post",
      title: "The Future of Work is Play",
      kind: "published",
      x: 0.35,
      y: 0.35,
      zoneId: "future-of-work",
    },
  ],
  counts: { entities: 2, topics: 1 },
};

describe("KnowledgeMapTemplate", () => {
  test("renders the proof section with defaults when no copy is authored", () => {
    const html = render(<KnowledgeMapTemplate {...data} />);

    // defaults are brain-agnostic — the plugin ships to every brain, so no
    // site-specific routes or repos may appear here
    expect(html).toContain("The corpus");
    expect(html).toContain("What this brain");
    expect(html).not.toContain("github.com");
    expect(html).toContain("kmap--site");
    expect(html).toContain("Future of Work · 1");
    // honest counts in the foot
    expect(html).toContain(">2</b> entities");
    expect(html).toContain(">1</b> topics");
    // proof links fold the alive-line in
    expect(html).toContain('href="/dashboard"');
  });

  test("authored copy replaces the defaults wholesale", () => {
    const authored: KnowledgeMapTemplateData = {
      ...data,
      cap: "Proof",
      headingLead: "The corpus",
      headingAccent: "as a sky",
      intro: "Custom intro.",
      primaryCta: { label: "Go →", href: "/go" },
      secondaryCta: { label: "Source", href: "https://example.com" },
      proofLinks: [{ label: "card", href: "/card" }],
    };
    const html = render(<KnowledgeMapTemplate {...authored} />);
    expect(html).toContain("The corpus");
    expect(html).toContain("Custom intro.");
    expect(html).toContain('href="/go"');
    expect(html).toContain('href="/card"');
    expect(html).not.toContain("waiting to be filed");
  });
});

describe("knowledge-map template registration", () => {
  test("registers with the datasource and a round-tripping overlay formatter", () => {
    const template = getKnowledgeMapTemplate();
    expect(template.dataSourceId).toBe("topics:knowledge-map");
    expect(template.requiredPermission).toBe("public");
    expect(template.schema.safeParse(data).success).toBe(true);

    const copy = {
      cap: "It starts with you",
      headingLead: "This site is",
      headingAccent: "a brain",
      intro: "It runs the platform it describes.",
      primaryCta: { label: "Start Building →", href: "/brain#quickstart" },
      secondaryCta: {
        label: "View on GitHub",
        href: "https://github.com/rizom-ai",
      },
      proofLinks: [
        { label: "talk to it", href: "/chat" },
        { label: "agent card", href: "/.well-known/agent-card.json" },
      ],
    };
    const markdown = template.overlayFormatter?.format(copy) ?? "";
    expect(markdown).toContain("## Cap");
    expect(markdown).toContain("## Heading Lead");
    expect(markdown).toContain("### Link 1");
    expect(template.overlayFormatter?.parse(markdown)).toMatchObject(copy);
  });

  test("the datasource carries the registered id", () => {
    // fetch itself is two lines of composition over the builder (fully
    // tested in knowledge-map-data.test.ts) and the schema parse; what the
    // registry depends on is the id contract.
    const source = new KnowledgeMapDataSource();
    expect(source.id).toBe("topics:knowledge-map");
  });
});
