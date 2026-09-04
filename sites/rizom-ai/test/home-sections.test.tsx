/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { createElement as h } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import site from "../src";
import { z } from "@brains/utils/zod";

/* Rev-10 home narrative: the growth section carries the system (three stage
   columns under the diagram), the mission band is the quote alone, the
   product hook gains its pull line, and the problem trio withers (hollow
   numerals, no accent warmth). These tests render the section components
   through the exported group, exactly as the site composes them. */

const groups = Array.isArray(site.sections)
  ? site.sections
  : site.sections
    ? [site.sections]
    : [];
const home = groups.find((group) => group.namespace === "home");
if (!home) throw new Error("home section group missing");

/* The group carries schemas opaquely (`unknown`) so the base SDK stays
   zod-free; narrow structurally for parsing in tests. */
interface ParsableSchema {
  parse(input: unknown): unknown;
  safeParse(input: unknown): { success: boolean };
}

/* The group carries schemas and components opaquely, so these check the
   shape they rely on rather than assert it — a section that stops exposing
   parse/safeParse, or whose component is not callable, fails here. */
const parsableSchemaSchema = z.custom<ParsableSchema>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "parse") === "function" &&
    typeof Reflect.get(value, "safeParse") === "function",
  "section schema must expose parse and safeParse",
);

const sectionComponentSchema = z.custom<ComponentType<Record<string, unknown>>>(
  (value) => typeof value === "function",
  "section component must be callable",
);

const propsSchema = z.record(z.string(), z.unknown());

function sectionSchema(id: string): ParsableSchema {
  const def = home?.sections[id];
  if (!def) throw new Error(`home section "${id}" missing`);
  return parsableSchemaSchema.parse(def.schema);
}

function renderSection(id: string, props: Record<string, unknown>): string {
  const def = home?.sections[id];
  if (!def) throw new Error(`home section "${id}" missing`);
  const parsed = propsSchema.parse(sectionSchema(id).parse(props));
  const component = sectionComponentSchema.parse(def.component);
  return render(h(component, parsed));
}

describe("home sections — rev 10", () => {
  test("growth renders the three stage columns in the diagram's colors", () => {
    const html = renderSection("growth", {
      cap: "One organism",
      capNote: "— how it comes together",
      stages: [
        { title: "The brain", text: "One agent that ships what you know." },
        {
          title: "The practice",
          text: "Working sessions map what a team knows.",
        },
        { title: "The network", text: "Constellations form." },
      ],
    });
    expect(html).toContain("The brain");
    expect(html).toContain("The practice");
    expect(html).toContain("The network");
    expect(html).toContain("--palette-brass");
    expect(html).toContain("--palette-ruby-soft");
    expect(html).toContain("--palette-moss");
  });

  test("growth schema requires stages — the old note-only shape is gone", () => {
    expect(
      sectionSchema("growth").safeParse({ cap: "c", capNote: "n", note: "x" })
        .success,
    ).toBe(false);
  });

  test("growth diagram drops the product-staging sub-labels", () => {
    const html = renderSection("growth", {
      cap: "One organism",
      stages: [
        { title: "The brain", text: "t" },
        { title: "The practice", text: "t" },
        { title: "The network", text: "t" },
      ],
    });
    expect(html).not.toContain("personal brain · available now");
    expect(html).not.toContain("the team bundle");
    expect(html).not.toContain("distributed expertise");
  });

  test("mission band renders the quote alone — no sub, no CTAs", () => {
    const html = renderSection("mission", {
      quote: "The future of work is *play*.",
    });
    expect(html).toContain("The future of work is");
    expect(html).not.toContain("<a ");
  });

  test("problem trio withers — hollow numerals, no accent warmth", () => {
    const html = renderSection("problem", {
      cap: "Alone, it withers",
      items: [
        { marker: "01", title: "Your best thinking never ships", text: "t" },
        { marker: "02", title: "Your team forgets what it knows", text: "t" },
        {
          marker: "03",
          title: "The right people never find each other",
          text: "t",
        },
      ],
    });
    expect(html).toContain("-webkit-text-stroke");
    expect(html).not.toContain("text-accent");
    expect(html).not.toContain("bg-accent");
  });
});
