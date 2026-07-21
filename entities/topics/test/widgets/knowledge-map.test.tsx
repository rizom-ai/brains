/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import { render } from "preact-render-to-string";
import { KnowledgeMap } from "../../src/widgets/knowledge-map";
import type { KnowledgeMapData } from "../../src/lib/knowledge-map-data";

/* The shared knowledge-map renderer. Topics are soft-bounded blob zones
   (mist + dashed border + floating label), points are kind-styled (published
   glows, skills are moss, ground is spores), and the whole render is
   deterministic so static builds stay stable. */

const data: KnowledgeMapData = {
  zones: [
    {
      id: "future-of-work",
      name: "Future of Work",
      x: 0.2,
      y: 0.25,
      memberIds: ["play-essay"],
    },
    {
      id: "staging",
      name: "Staging Deployment",
      x: 0.75,
      y: 0.7,
      memberIds: [],
    },
  ],
  points: [
    {
      id: "play-essay",
      entityType: "post",
      title: "The Future of Work is Play",
      kind: "published",
      x: 0.26,
      y: 0.3,
      zoneId: "future-of-work",
    },
    {
      id: "team-skill",
      entityType: "skill",
      title: "Team Assessment",
      kind: "skill",
      x: 0.6,
      y: 0.4,
      zoneId: null,
    },
    {
      id: "swot",
      entityType: "swot",
      title: "SWOT",
      kind: "pearl",
      x: 0.5,
      y: 0.8,
      zoneId: null,
    },
    {
      id: "blog-excerpt",
      entityType: "prompt",
      title: "blog excerpt",
      kind: "ground",
      x: 0.4,
      y: 0.6,
      zoneId: null,
    },
    {
      id: "cococo",
      entityType: "deck",
      title: "CoCoCo",
      kind: "published",
      x: 0.9,
      y: 0.15,
      zoneId: null,
    },
  ],
  counts: { entities: 7, topics: 2 },
};

describe("KnowledgeMap", () => {
  test("renders zones as labeled territories and kind-styled points", () => {
    const html = render(<KnowledgeMap data={data} />);

    // a zone with members carries its name and count; blob border is dashed
    expect(html).toContain("Future of Work · 1");
    expect(html).toContain("stroke-dasharray");

    // published entities glow — but carry no titles: the glow is the
    // statement, names live in the console. Text discipline keeps the sky
    // legible at real corpus sizes.
    expect(html).toContain("kmap-breathe");
    expect(html).not.toContain("The Future of Work is Play");
    expect(html).not.toContain("CoCoCo");

    // kinds map to their classes
    expect(html).toContain("kmap-point--skill");
    expect(html).toContain("kmap-point--pearl");
    expect(html).toContain("kmap-point--ground");

    // colors ride surface-mapped custom properties, never literals
    expect(html).toContain("var(--kmap-");
  });

  test("empty zones stay silent — only member territories are named", () => {
    const html = render(<KnowledgeMap data={data} />);
    expect(html).toContain("Future of Work · 1");
    expect(html).not.toContain("Staging Deployment");

    const crowded: KnowledgeMapData = {
      ...data,
      zones: Array.from({ length: 12 }, (_, i) => ({
        id: `topic-${i}`,
        name: `Topic ${i}`,
        x: (i % 4) * 0.25 + 0.1,
        y: Math.floor(i / 4) * 0.3 + 0.15,
        memberIds: i === 0 ? ["play-essay"] : [],
      })),
    };
    const crowdedHtml = render(<KnowledgeMap data={crowded} />);
    expect(crowdedHtml).toContain("Topic 0 · 1");
    expect(crowdedHtml).not.toContain("Topic 11");
  });

  test("colliding zone labels are skipped — priority zones win", () => {
    const collided: KnowledgeMapData = {
      zones: [
        { id: "a", name: "Alpha Systems", x: 0.5, y: 0.5, memberIds: ["p"] },
        {
          id: "b",
          name: "Beta Systems",
          x: 0.52,
          y: 0.5,
          memberIds: ["q", "r", "s"],
        },
      ],
      points: [
        {
          id: "p",
          entityType: "post",
          title: "P",
          kind: "published",
          x: 0.5,
          y: 0.52,
          zoneId: "a",
        },
        {
          id: "q",
          entityType: "post",
          title: "Q",
          kind: "published",
          x: 0.5,
          y: 0.52,
          zoneId: "b",
        },
        {
          id: "r",
          entityType: "skill",
          title: "R",
          kind: "skill",
          x: 0.51,
          y: 0.52,
          zoneId: "b",
        },
        {
          id: "s",
          entityType: "link",
          title: "S",
          kind: "pearl",
          x: 0.52,
          y: 0.52,
          zoneId: "b",
        },
      ],
      counts: { entities: 6, topics: 2 },
    };
    const html = render(<KnowledgeMap data={collided} />);
    expect(html).toContain("Beta Systems · 3");
    expect(html).not.toContain("Alpha Systems · 1");
  });

  test("only zones holding members carry the mist", () => {
    const html = render(<KnowledgeMap data={data} />);
    const mists = html.match(/url\(#kmap-mist-dashboard\)/g) ?? [];
    // one zone with members in the fixture — exactly one mist fill
    expect(mists).toHaveLength(1);
  });

  test("includes accessible summary and an explanatory legend", () => {
    const html = render(<KnowledgeMap data={data} />);
    expect(html).toContain(
      'aria-labelledby="kmap-title-dashboard kmap-desc-dashboard"',
    );
    expect(html).toContain("Knowledge map");
    expect(html).toContain("7 entities and 2 topics");
    expect(html).toContain("topic zones");
    expect(html).toContain("published");
    expect(html).toContain("references");
  });

  test("renders byte-identically across builds and switches surfaces", () => {
    expect(render(<KnowledgeMap data={data} />)).toBe(
      render(<KnowledgeMap data={data} />),
    );
    const site = render(<KnowledgeMap data={data} surface="site" />);
    expect(site).toContain("kmap--site");
    expect(site).toContain('aria-labelledby="kmap-title-site kmap-desc-site"');
  });
});
