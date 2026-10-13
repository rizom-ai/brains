/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "@rizom/site";
import { sectionGroupToTemplates } from "@brains/site-composition";
import { brainSections } from "../src/brain";

const componentSchema = z.custom<ComponentType<Record<string, unknown>>>(
  (value) => typeof value === "function",
);
const propsSchema = z.record(z.string(), z.unknown());
const templates = sectionGroupToTemplates(brainSections);
const lead = {
  cap: "01 · Answers",
  headline: "Ask it *what you know.*",
  body: ["Authored copy.", "A second paragraph."],
};
const cta = { label: "Start a brain ↓", href: "#quickstart" };
const aside = {
  text: "Something particular to you is a plugin.",
  links: [{ label: "Plugin authoring ↗", href: "https://example.com" }],
};
function render(id: string, data: unknown): string {
  const section = brainSections.sections[id];
  if (!section) throw new Error(id);
  return renderToStaticMarkup(
    createElement(
      componentSchema.parse(section.component),
      propsSchema.parse(section.schema.parse(data)),
    ),
  );
}

describe("the Brain page, told as a story", () => {
  test("keeps its section ids", () => {
    expect(Object.keys(brainSections.sections)).toEqual([
      "hero",
      "capture",
      "ask",
      "run",
      "connect",
      "your-data",
      "quickstart",
    ]);
  });

  test("the opening is a chapter with the headline, the lede and two doors, without a chat box", () => {
    const html = render("hero", {
      ...lead,
      cap: "The tools",
      headline: "Build the agent that *represents you.*",
      provenance: "· available now",
      primaryCta: cta,
      secondaryCta: { label: "See what it can do", href: "#answers" },
      chat: { title: "Ask Rizom anything." },
      navigation: [cta, cta, cta, cta],
    });
    expect(html).toMatch(/^<section id="brain-hero" class="chapter">/);
    expect(html).toContain('<p class="eyebrow">The tools</p>');
    expect(html).toContain(
      "<h1>Build the agent that <em>represents you.</em></h1>",
    );
    expect(html).toContain('<p class="lede">Authored copy.</p>');
    expect(html).toContain("<p>A second paragraph.</p>");
    expect(html).toContain(
      '<p class="doors-in"><a href="#quickstart">Start a brain ↓</a><a href="#answers">See what it can do</a></p>',
    );
    expect(html).not.toContain("data-ask-box");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("chapter-nav");
    expect(html).not.toContain("Ask Rizom anything.");
  });

  test("answers, capabilities and the collective are chapters with their aside", () => {
    for (const [id, anchor] of [
      ["capture", "answers"],
      ["ask", "capabilities"],
      ["connect", "collective"],
    ]) {
      const html = render(id ?? "", { ...lead, aside });
      expect(html).toMatch(
        new RegExp(`^<section id="${anchor}" class="chapter">`),
      );
      expect(html).toContain('<p class="eyebrow">01 · Answers</p>');
      expect(html).toContain("<h2>Ask it <em>what you know.</em></h2>");
      expect(html).toContain(
        '<p class="aside">Something particular to you is a plugin. <a href="https://example.com">Plugin authoring ↗</a></p>',
      );
      expect(html).not.toContain("<img");
      expect(html).not.toContain("<pre");
    }
  });

  test("you, team and network are the chapter's parts with their status", () => {
    const html = render("run", {
      label: "You, team, network",
      items: [
        {
          title: "You",
          tag: "Available now",
          text: "A brain for your own practice.",
        },
        {
          title: "Team",
          tag: "The team bundle",
          text: "A brain owned by a team.",
        },
        {
          title: "Network",
          tag: "Emerging",
          text: "Independently owned brains.",
        },
      ],
    });
    expect(html).toMatch(
      /^<section id="run" class="chapter" data-title="You, team, network">/,
    );
    expect(html).toContain('<dl class="parts">');
    expect(html).toContain(
      '<dt>You <span class="status">Available now</span></dt><dd>A brain for your own practice.</dd>',
    );
    expect(html).not.toContain("<h2");
  });

  test("stays yours lists its three parts", () => {
    const html = render("your-data", {
      ...lead,
      items: [1, 2, 3].map((n) => ({ title: `Part ${n}`, text: `Text ${n}` })),
    });
    expect(html).toMatch(/^<section id="yours" class="chapter">/);
    expect(html).toContain("<dt>Part 1</dt><dd>Text 1</dd>");
  });

  test("quick start keeps the terminal, its indentation and optional lines, and opens two doors", () => {
    const data = {
      ...lead,
      code: {
        title: "terminal",
        note: "@rizom/brain",
        lines: [
          { text: "# install", indent: 0, kind: "comment" },
          { text: "$ bun add -g @rizom/brain", indent: 0, kind: "code" },
          { text: "- core", indent: 2, kind: "code" },
          { text: "# - automation", indent: 2, kind: "optional" },
        ],
      },
      options: [
        {
          cap: "Run it yourself",
          title: "Read the setup guide.",
          text: "Configuration and deployment.",
          cta: { label: "Open the docs ↗", href: "https://docs.rizom.ai/" },
        },
        {
          cap: "Start with a session",
          title: "Map what your team knows first.",
          text: "Before deciding how a brain should fit.",
          cta: { label: "Book a knowledge session ↗", href: "/work" },
        },
      ],
    };
    const formatter = templates["quickstart"]?.formatter;
    if (!formatter) throw new Error("Missing formatter");
    expect(formatter.parse(formatter.format(data))).toEqual(data);
    const html = render("quickstart", data);
    expect(html).toMatch(/^<section id="quickstart" class="chapter">/);
    expect(html).toContain('<pre class="code" aria-label="terminal">');
    expect(html).toContain("<i># install</i>");
    expect(html).toContain("<b>$</b> bun add -g @rizom/brain");
    expect(html).toContain("  - core");
    expect(html).toContain("<i>  # - automation</i>");
    expect(html).toContain('<div class="doors">');
    expect(html).toContain('<a class="door" href="https://docs.rizom.ai/">');
    expect(html).toContain('<a class="door door--work" href="/work">');
    expect(html).toContain('<span class="door__go">Open the docs ↗</span>');
  });

  test("authored values remain escaped", () => {
    const html = render("run", {
      label: "Ownership",
      items: [1, 2, 3].map((index) => ({
        title: String(index),
        tag: "<script>alert(1)</script>",
        text: "Content",
      })),
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
