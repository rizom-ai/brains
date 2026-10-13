/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "@rizom/site";
import { sectionGroupToTemplates } from "@brains/site-composition";
import { workSections } from "../src/work";

const componentSchema = z.custom<ComponentType<Record<string, unknown>>>(
  (value) => typeof value === "function",
);
const propsSchema = z.record(z.string(), z.unknown());
const templates = sectionGroupToTemplates(workSections);
function render(id: string, data: unknown): string {
  const section = workSections.sections[id];
  if (!section) throw new Error(id);
  return renderToStaticMarkup(
    createElement(
      componentSchema.parse(section.component),
      propsSchema.parse(section.schema.parse(data)),
    ),
  );
}
const quiz = { label: "Take the Team Type quiz →", href: "/work#quiz" };
const call = { label: "Book a discovery call", href: "/work#contact" };
const steps = [
  { lead: "A short async survey.", text: "A questionnaire." },
  { lead: "A half-day in the room.", text: "A shared map." },
  { lead: "A thirty-day playbook.", text: "Concrete changes." },
];

describe("the Work page, told as a story", () => {
  test("keeps its section ids", () => {
    expect(Object.keys(workSections.sections)).toEqual([
      "hero",
      "problem",
      "workshop",
      "personas",
      "quotes",
      "roster",
      "closer",
    ]);
  });

  test("the opening is a chapter with the headline, the standfirst and two doors, without the diagnostic", () => {
    const html = render("hero", {
      eyebrow: "Coordination for the AI era",
      provenance: "previously rizom.work",
      headline: "Your team has a knowledge problem. *AI is making it visible.*",
      standfirst: "TMS-based consulting.",
      primaryCta: quiz,
      secondaryCta: call,
      diagnostic: { teamType: "Distributed specialists" },
    });
    expect(html).toMatch(/^<section id="work-hero" class="chapter">/);
    expect(html).toContain(
      '<p class="eyebrow">Coordination for the AI era</p>',
    );
    expect(html).toContain(
      "<h1>Your team has a knowledge problem. <em>AI is making it visible.</em></h1>",
    );
    expect(html).toContain('<p class="lede">TMS-based consulting.</p>');
    expect(html).toContain(
      '<a href="/work#quiz">Take the Team Type quiz →</a>',
    );
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("Distributed specialists");
  });

  test("the problem is a chapter", () => {
    const html = render("problem", {
      cap: "The problem",
      capNote: null,
      headline: "Talent isn't the bottleneck. *Coordination* is.",
      intro: "Teams don't fail because people are untalented.",
    });
    expect(html).toMatch(/^<section id="work-problem" class="chapter">/);
    expect(html).toContain(
      "<h2>Talent isn&#x27;t the bottleneck. <em>Coordination</em> is.</h2>",
    );
    expect(html).toContain(
      "<p>Teams don&#x27;t fail because people are untalented.</p>",
    );
  });

  test("the audit carries the bar's anchor, its numbered steps and a door when the content gives one", () => {
    const data = {
      cap: "The Knowledge Audit",
      headline: "One audit. A map your whole team *can act on*.",
      intro: "We map your team's transactive memory system.",
      steps,
      ctas: [{ label: "Book an audit", href: "/work#contact" }],
    };
    const formatter = templates["workshop"]?.formatter;
    if (!formatter) throw new Error("Missing formatter");
    expect(formatter.parse(formatter.format(data))).toEqual(data);
    const html = render("workshop", data);
    expect(html).toMatch(
      /^<section id="audit" class="chapter" data-title="The Knowledge Audit">/,
    );
    expect(html).toContain('<ol class="steps">');
    expect(html).toContain(
      "<li><b>A short async survey.</b><span>A questionnaire.</span></li>",
    );
    expect(html).toContain(
      '<a class="cta" href="/work#contact">Book an audit</a>',
    );
    // Without a door in the content, the chapter still reads.
    const bare = render("workshop", { ...data, ctas: undefined });
    expect(bare).not.toContain('class="cta"');
  });

  test("the personas and the quotes are voices", () => {
    const personas = render("personas", {
      cap: "If this sounds like you",
      personas: [
        {
          role: "The scaling founder",
          quote: "“Your team grew faster than your operating model.”",
          text: "You hired smart people.",
        },
      ],
    });
    expect(personas).toMatch(
      /^<section id="personas" class="chapter" data-title="If this sounds like you">/,
    );
    expect(personas).toContain('<div class="voices">');
    expect(personas).toContain(
      "<blockquote><small>The scaling founder</small>“Your team grew faster than your operating model.”<p>You hired smart people.</p></blockquote>",
    );
    const quotes = render("quotes", {
      cap: "What teams tell us",
      capNote: "— recent engagements",
      quotes: [
        {
          text: "We thought we had a hiring problem.",
          by: "a SaaS company · Taipei",
        },
      ],
    });
    expect(quotes).toMatch(/^<section id="proof" class="chapter"/);
    expect(quotes).toContain(
      "<blockquote>We thought we had a hiring problem.<cite>a SaaS company · Taipei</cite></blockquote>",
    );
  });

  test("who we are names the people and points at the Foundation", () => {
    const html = render("roster", {
      cap: "Who we are",
      capNote: "— a commercial practice",
      people: [
        { init: "JH", name: "A Founder", role: "Founder & CEO" },
        {
          init: "＋",
          name: "A network of practitioners",
          role: "facilitation",
        },
      ],
    });
    expect(html).toMatch(/^<section id="people" class="chapter">/);
    expect(html).toContain('<ul class="people">');
    expect(html).toContain(
      "<li><b>A Founder</b><span>Founder &amp; CEO</span></li>",
    );
    expect(html).toContain(
      '<p class="onward"><a href="/foundation">The research arm, at the Foundation</a></p>',
    );
    expect(html).not.toContain("— a commercial practice");
  });

  test("the closer asks the question and opens its two doors", () => {
    const html = render("closer", {
      quote: "Ready to find out what *type of team* you are?",
      primaryCta: quiz,
      secondaryCta: call,
    });
    expect(html).toMatch(
      /^<section id="closer" class="chapter" data-title="Your team type">/,
    );
    expect(html).toContain(
      "<h2>Ready to find out what <em>type of team</em> you are?</h2>",
    );
    expect(html).toContain(
      '<p class="doors-in"><a href="/work#quiz">Take the Team Type quiz →</a><a href="/work#contact">Book a discovery call</a></p>',
    );
  });

  test("authored text is escaped rather than treated as HTML", () => {
    const html = render("problem", {
      cap: "<b>cap</b>",
      headline: "<script>alert(1)</script>",
      intro: "<img src=x>",
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});
