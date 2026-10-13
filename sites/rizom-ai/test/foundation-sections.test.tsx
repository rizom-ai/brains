/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "@rizom/site";
import site from "../src";
import { foundationSections } from "../src/foundation";

const componentSchema = z.custom<ComponentType<Record<string, unknown>>>(
  (value) => typeof value === "function",
);
const propsSchema = z.record(z.string(), z.unknown());
function renderSection(id: string, data: unknown): string {
  const definition = foundationSections.sections[id];
  if (!definition) throw new Error(`Missing section ${id}`);
  return renderToStaticMarkup(
    createElement(
      componentSchema.parse(definition.component),
      propsSchema.parse(definition.schema.parse(data)),
    ),
  );
}

const cta = { label: "Join our Discord →", href: "/foundation#events" };
const rows = [
  {
    no: "01",
    kicker: "Spring 2026",
    title: "Amsterdam",
    text: "The original chapter.",
    meta: "apply →",
    metaSub: "anchor: Jan Hein",
  },
  {
    no: "02",
    kicker: "Summer 2026",
    title: "Rotterdam",
    text: "A working chapter.",
    href: "/foundation#events",
  },
];

describe("the Foundation story", () => {
  test("keeps its section ids and their route", () => {
    expect(Object.keys(foundationSections.sections)).toEqual([
      "hero",
      "research",
      "pullquote",
      "chapters",
      "support",
      "follow",
    ]);
    const route = site.routes.find((route) => route.id === "foundation");
    expect(route?.sections?.map((s) => s.template)).toEqual([
      "foundation:hero",
      "foundation:research",
      "foundation:pullquote",
      "foundation:chapters",
      "foundation:support",
      "foundation:follow",
    ]);
  });

  test("opens as the first chapter, with the headline and the standfirst", () => {
    const html = renderSection("hero", {
      volume: "Vol. 01 · 2026",
      meta: "Essays · Events",
      headline:
        "Work is broken* — and the institutions* were built for a different century.",
      standfirst: "A research arm for the social contracts.",
      primaryCta: cta,
      secondaryCta: { label: "Find an event", href: "/foundation#events" },
    });
    expect(html).toMatch(/^<section id="foundation-hero" class="chapter">/);
    expect(html).toContain('<p class="eyebrow">Foundation</p>');
    expect(html).toContain("<h1>Work is broken");
    expect(html).toContain("were built for a different century.");
    expect(html).toContain(
      '<p class="lede">A research arm for the social contracts.</p>',
    );
    expect(html).toContain('href="/foundation#events"');
    expect(html).not.toContain("Vol. 01");
  });

  test("lists research and chapters as entries on a thread", () => {
    const html = renderSection("chapters", {
      cap: "The series",
      capNote: "— twenty to forty people",
      items: rows,
    });
    expect(html).toMatch(/^<section id="events" class="chapter">/);
    expect(html).toContain('<p class="eyebrow">The series</p>');
    expect(html).toContain('<ul class="entries">');
    expect(html).toContain("<small>Spring 2026</small><b>Amsterdam</b>");
    expect(html).toContain("The original chapter. anchor: Jan Hein");
    expect(html).toContain('<a href="/foundation#events">');
    expect(
      renderSection("research", {
        cap: "The research",
        capNote: "",
        items: rows,
      }),
    ).toMatch(/^<section id="research" class="chapter">/);
  });

  test("sets the pull quote as a chapter of its own", () => {
    const html = renderSection("pullquote", {
      quote: "The smartest thing in any room is rarely a person.",
      attribution: "— from “Coordination is the unit of intelligence”",
    });
    expect(html).toMatch(
      /^<section id="pullquote" class="chapter" data-title="The pattern">/,
    );
    expect(html).toContain(
      '<p class="pull">The smartest thing in any room is rarely a person.</p>',
    );
    expect(html).toContain(
      "<p>— from “Coordination is the unit of intelligence”</p>",
    );
  });

  test("lists the ways to support as parts, with the amount as the status", () => {
    const html = renderSection("support", {
      cap: "How to support",
      capNote: "— two ways",
      options: [
        {
          kicker: "For individuals",
          amount: "€1,000 – €10,000",
          text: "Funds the research.",
        },
        {
          kicker: "Through the practice",
          amount: "Commercial work → research",
          text: "The practice funds it.",
        },
      ],
    });
    expect(html).toMatch(/^<section id="support" class="chapter">/);
    expect(html).toContain('<dl class="parts">');
    expect(html).toContain(
      '<dt>For individuals <span class="status">€1,000 – €10,000</span></dt><dd>Funds the research.</dd>',
    );
  });

  test("closes on the follow line", () => {
    const html = renderSection("follow", {
      claim: "*Follow the research* —",
      links: [{ label: "rss", href: "/feed.xml" }],
    });
    expect(html).toMatch(
      /^<section id="follow" class="chapter" data-title="Follow the research">/,
    );
    expect(html).toContain('href="/feed.xml"');
  });
});
