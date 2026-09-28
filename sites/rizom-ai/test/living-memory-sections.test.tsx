/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "@rizom/site";
import { sectionGroupToTemplates } from "@brains/site-composition";
import site from "../src";
import { livingMemorySections } from "../src/living-memory";

const componentSchema = z.custom<ComponentType<Record<string, unknown>>>(
  (value) => typeof value === "function",
);
const propsSchema = z.record(z.string(), z.unknown());
const templates = sectionGroupToTemplates(livingMemorySections);
function renderSection(id: string, data: unknown): string {
  const definition = livingMemorySections.sections[id];
  if (!definition) throw new Error(`Missing section ${id}`);
  return renderToStaticMarkup(
    createElement(
      componentSchema.parse(definition.component),
      propsSchema.parse(definition.schema.parse(data)),
    ),
  );
}
const lead = {
  cap: "The science",
  claim: "A team's intelligence is *not the sum* of its members' talent.",
  body: ["Organisational psychology has one finding it keeps replicating."],
};
const dimensions = [
  "Who knows what",
  "Whose judgment settles it",
  "How knowledge moves",
].map((name) => ({
  name,
  title: "A title",
  emphasis: "with emphasis",
  text: `Explanation for ${name}`,
}));
const stages = [
  {
    key: "You",
    title: "The brain",
    text: "One agent that ships what you know.",
  },
  {
    key: "Team",
    title: "The practice",
    text: "Working sessions map what a team knows.",
  },
  {
    key: "Network",
    title: "The network",
    text: "Brains find each other by substance.",
  },
];
const rows = ["01", "02", "03"].map((no) => ({
  no,
  kicker: `Stage ${no}`,
  title: `Title ${no}`,
  text: `Explanation ${no}`,
  meta: "In development",
}));

describe("the homepage story", () => {
  test("keeps its section ids and drops what other pages already say", () => {
    expect(Object.keys(livingMemorySections.sections)).toEqual([
      "problem",
      "science",
      "turn",
      "system",
      "growth",
      "arc",
      "doors",
    ]);
    const route = site.routes.find((route) => route.id === "living-memory");
    expect(route?.sections).toEqual([
      { id: "hero", template: "rizom:opening", dataQuery: {} },
      { id: "science", template: "living-memory:science" },
      { id: "turn", template: "living-memory:turn" },
      { id: "growth", template: "living-memory:growth" },
      { id: "arc", template: "living-memory:arc" },
      { id: "doors", template: "living-memory:doors" },
    ]);
    expect(route?.path).toBe("/");
    expect(site.routes.some((route) => route.path === "/network")).toBe(false);
    expect(Object.keys(templates)).toContain("problem");
  });

  test("the science is a chapter with its three dimensions", () => {
    const html = renderSection("science", { ...lead, dimensions });
    expect(html).toMatch(/^<section id="science" class="chapter">/);
    expect(html).toContain('<p class="eyebrow">The science</p>');
    expect(html).toContain(
      "<h2>A team&#x27;s intelligence is <em>not the sum</em> of its members&#x27; talent.</h2>",
    );
    expect(html).toContain('<dl class="dims">');
    expect(html).toContain(
      "<dt>Who knows what</dt><dd>Explanation for Who knows what</dd>",
    );
    expect(html).not.toContain('role="tab"');
    expect(() =>
      renderSection("science", { ...lead, dimensions: dimensions.slice(1) }),
    ).toThrow();
  });

  test("the shift keeps the quotation as the chapter's heading", () => {
    const html = renderSection("turn", {
      cap: "The shift",
      quote: "Four decades of that research studied teams of humans.",
      emphasis: "Those teams no longer exist.",
      body: ["Every team is now a hybrid team."],
    });
    expect(html).toMatch(/^<section id="turn" class="chapter">/);
    expect(html).toContain(
      "<h2>Four decades of that research studied teams of humans. <em>Those teams no longer exist.</em></h2>",
    );
    expect(html).toContain("<p>Every team is now a hybrid team.</p>");
  });

  test("the organism's parts are the site's rooms", () => {
    const html = renderSection("growth", {
      cap: "One organism",
      claim: "How it *comes together.*",
      stages,
    });
    expect(html).toMatch(/^<section id="growth" class="chapter">/);
    expect(html).toContain('<dl class="parts">');
    expect(html).toContain(
      '<dt><a href="/brain">The brain</a></dt><dd>One agent that ships what you know.</dd>',
    );
    expect(html).toContain('<dt><a href="/work">The practice</a></dt>');
    expect(html).toContain('<dt><a href="#hero">The network</a></dt>');
    expect(html).not.toContain("<svg");
  });

  test("where this goes lists its three moves with their honest status", () => {
    const html = renderSection("arc", {
      cap: "Where this goes",
      claim: "Measure. Connect. *Coordinate.*",
      rows,
    });
    expect(html).toMatch(/^<section id="arc" class="chapter">/);
    expect(html).toContain(
      '<dt>Title 01 <span class="status">In development</span></dt><dd>Explanation 01</dd>',
    );
    expect(html).toContain(
      '<p class="onward"><a href="/foundation">The research behind it, at the Foundation</a></p>',
    );
    expect(html).not.toContain("<details");
  });

  test("two ways in closes the story on its two doors, the practice's in its own room", () => {
    const html = renderSection("doors", {
      ...lead,
      cap: "Two ways in",
      claim: "Start with *an audit,* or start with the code.",
      doors: [
        {
          room: "work",
          key: "The practice",
          title: "A Knowledge Audit",
          text: "Half a day with your team.",
          cta: { label: "Book an audit", href: "/work#audit" },
        },
        {
          room: "platform",
          key: "The platform",
          title: "Run a brain yourself",
          text: "Open source and self-hostable.",
          cta: {
            label: "See the repository",
            href: "https://github.com/rizom-ai/brains",
          },
        },
      ],
    });
    expect(html).toMatch(/^<section id="doors" class="chapter">/);
    expect(html).toContain('<div class="doors">');
    expect(html).toContain('<a class="door door--work" href="/work#audit">');
    expect(html).toContain(
      '<span class="door__room">The practice</span><span class="door__title">A Knowledge Audit</span>',
    );
    expect(html).toContain('<span class="door__go">Book an audit</span>');
    expect(html).toContain(
      '<a class="door" href="https://github.com/rizom-ai/brains">',
    );
  });

  test("authored text is escaped rather than treated as HTML", () => {
    const html = renderSection("turn", {
      cap: "<b>cap</b>",
      quote: "<script>alert(1)</script>",
      emphasis: "x",
      body: ["<img src=x>"],
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});
