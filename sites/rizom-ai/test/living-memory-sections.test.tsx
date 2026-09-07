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
  cap: "Caption",
  claim: "A claim",
  body: ["A paragraph with *emphasis*."],
};
const dimensions = ["First", "Second", "Third"].map((name) => ({
  name,
  title: "A title",
  emphasis: "with emphasis",
  text: `Explanation for ${name}`,
}));
const stages = ["You", "Team", "Network"].map((key) => ({
  key,
  title: key,
  text: `${key} description`,
}));
const rows = ["01", "02", "03"].map((no) => ({
  no,
  kicker: `Stage ${no}`,
  title: `Title ${no}`,
  text: `Explanation ${no}`,
  meta: "In development",
}));

describe("approved living-memory composition", () => {
  test("is the only homepage, preserves content identity, and keeps the maps live", () => {
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
      { id: "hero", template: "agent-discovery:proximity-map", dataQuery: {} },
      { id: "problem", template: "living-memory:problem" },
      { id: "science", template: "living-memory:science" },
      { id: "turn", template: "living-memory:turn" },
      { id: "system", template: "living-memory:system" },
      { id: "growth", template: "living-memory:growth" },
      { id: "proof", template: "topics:knowledge-map", dataQuery: {} },
      { id: "arc", template: "living-memory:arc" },
      { id: "doors", template: "living-memory:doors" },
    ]);
    expect(route?.path).toBe("/");
    expect(site.routes.filter((route) => route.path === "/")).toHaveLength(1);
    expect(site.routes.some((route) => route.path === "/living-memory")).toBe(
      false,
    );
    expect(site.routes.some((route) => route.id === "home")).toBe(false);
  });
  test("lantern retains one illustration and three accessible states", () => {
    const html = renderSection("science", { ...lead, dimensions });
    expect(html.match(/<svg/g)).toHaveLength(1);
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
    expect(html).toContain('aria-controls="panel-2"');
    expect(html).toContain('aria-labelledby="tab-2"');
    expect(html).toContain('data-active="0"');
    expect(html).toContain('class="title">A title <em>with emphasis</em>');
    expect(html).toContain('class="light-state light-2"');
    expect(() =>
      renderSection("science", { ...lead, dimensions: dimensions.slice(1) }),
    ).toThrow();
  });
  test("headings render content-authored italic phrases without changing the lantern", () => {
    const html = renderSection("science", {
      ...lead,
      claim: "A *quiet emphasis* here",
      dimensions,
    });
    expect(html).toContain(
      '<span class="heading-emphasis">quiet emphasis</span>',
    );
    expect(html).toContain('class="title">A title <em>with emphasis</em>');
    expect(html).not.toContain("*quiet emphasis*");
  });

  test("the page wrapper does not mask the shared theme background in wide layouts", () => {
    const css = site.staticAssets?.["/styles/living-memory.css"];
    const pageRule = css?.match(/:scope\s*\{([^}]+)\}/)?.[1];
    expect(pageRule).toBeDefined();
    expect(pageRule).not.toMatch(/background(?:-color|-image)?\s*:/);
  });

  test("sticky navigation uses the shared theme surface without washing out its texture", () => {
    const css = site.staticAssets?.["/styles/living-memory.css"];
    const headerRule = css?.match(/\.site-header\s*\{([^}]+)\}/)?.[1];
    expect(headerRule).toContain("background-color: var(--color-bg)");
    expect(headerRule).toContain("background-image: var(--bg-noise)");
    expect(headerRule).toContain("backdrop-filter: none");
    expect(headerRule).toContain("position: sticky");
  });

  test("heading emphasis follows the brand: italic, accent yellow, and inline", () => {
    const css = site.staticAssets?.["/styles/living-memory.css"];
    for (const pattern of [
      /\.heading-emphasis\s*\{([^}]+)\}/,
      /\.knowledge-map-site__heading em\s*\{([^}]+)\}/,
      /\.agent-proximity-site__heading em\s*\{([^}]+)\}/,
      /\.turn-emphasis\s*\{([^}]+)\}/,
    ]) {
      const rule = css?.match(pattern)?.[1];
      expect(rule).toContain("font-style: italic");
      expect(rule).toContain("color: var(--color-accent)");
      expect(rule).toContain("display: inline");
    }
  });

  test("the problem remains three unboxed pieces of authored copy", () => {
    const html = renderSection("problem", {
      cap: "A problem",
      items: stages.map((stage) => ({ title: stage.title, text: stage.text })),
    });
    expect(html.match(/<article/g)).toHaveLength(3);
    expect(html).not.toContain("problem-marker");
  });
  test("the shift separates the quotation from its supporting copy", () => {
    const html = renderSection("turn", {
      cap: "Shift",
      quote: "Before.",
      emphasis: "After.",
      body: ["Why it matters."],
    });
    expect(html).toContain(
      'Before.</span> <em class="turn-emphasis">After.</em>',
    );
    expect(html).toContain('class="turn-bottom"');
  });
  test("comparisons are paired rows, not independent lists", () => {
    const html = renderSection("system", {
      ...lead,
      availability: "Available",
      comparison: {
        beforeLabel: "Before",
        beforeTitle: "Old",
        afterLabel: "After",
        afterTitle: "New",
        rows: [
          { before: "Manual", after: "Automatic" },
          { before: "Stale", after: "Current" },
        ],
      },
    });
    expect(html.match(/scope="col"/g)).toHaveLength(2);
    expect(html).toContain("<tr><td>Manual</td><td>Automatic</td></tr>");
    expect(html).toContain("<tr><td>Stale</td><td>Current</td></tr>");
    expect(html).not.toContain("<ul");
  });
  test("the organism provides three vertical illustrations without a carousel", () => {
    const html = renderSection("growth", {
      cap: "Organism",
      claim: "Connected",
      stages,
    });
    expect(html.match(/class="organism-mini"/g)).toHaveLength(3);
    expect(html).toContain('viewBox="0 0 320 96"');
    expect(html).toContain('viewBox="0 0 320 132"');
    expect(html).not.toContain("carousel");
    expect(() =>
      renderSection("growth", {
        cap: "Organism",
        claim: "Connected",
        stages: [],
      }),
    ).toThrow();
  });
  test("roadmap details are accessible without JavaScript", () => {
    const html = renderSection("arc", {
      cap: "Roadmap",
      claim: "Next steps",
      rows,
    });
    expect(html.match(/<details class="roadmap-detail" open/g)).toHaveLength(3);
    expect(html.match(/<summary>/g)).toHaveLength(3);
    expect(html).toContain("Explanation 03");
    expect(html).toContain("In development");
  });
  test("doors preserve the practice's room accent", () => {
    const html = renderSection("doors", {
      ...lead,
      doors: ["work", "platform"].map((room) => ({
        room,
        key: room,
        title: room,
        text: "Description",
        cta: { label: "Enter", href: "/work" },
      })),
    });
    expect(html).toContain('data-room="work"');
    expect(html).toContain('class="button"');
    expect(html).toContain('class="text-link"');
  });
  test("the final science schema round-trips through canonical markdown", () => {
    const formatter = templates["science"]?.formatter;
    if (!formatter) throw new Error("Science formatter missing");
    const data = { ...lead, claim: "A *quiet emphasis* here", dimensions };
    expect(formatter.parse(formatter.format(data))).toEqual(data);
  });
  test("authored text is escaped rather than treated as HTML", () => {
    const html = renderSection("science", {
      ...lead,
      claim: '<img src=x onerror="alert(1)">',
      dimensions,
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
