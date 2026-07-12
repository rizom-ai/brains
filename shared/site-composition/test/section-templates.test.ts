import { describe, expect, test } from "bun:test";
import { h } from "preact";
import { defineSection, sectionGroup, z } from "@rizom/site-sections";
import {
  sectionToTemplate,
  sectionGroupToTemplates,
} from "../src/section-templates";

/** A component that ignores props — assignable to any section ComponentType. */
const noop = (): ReturnType<typeof h> => h("span", null);

const richSchema = z.object({
  headline: z.string(),
  count: z.number(),
  kind: z.enum(["a", "b"]),
  note: z.string().optional(),
  tags: z.array(z.string()),
  cards: z.array(z.object({ title: z.string(), body: z.string() })),
  cta: z.object({ label: z.string(), href: z.string() }),
});

function richTemplate(): ReturnType<typeof sectionToTemplate> {
  return sectionToTemplate(
    "hero",
    defineSection(richSchema, noop, { title: "Hero", description: "d" }),
  );
}

describe("sectionToTemplate", () => {
  test("round-trips content through the schema-derived formatter", () => {
    const { formatter } = richTemplate();
    if (!formatter) throw new Error("expected a formatter");

    const value = {
      headline: "Hi",
      count: 3,
      kind: "a" as const,
      note: "a note",
      tags: ["x", "y"],
      cards: [
        { title: "T1", body: "B1" },
        { title: "T2", body: "B2" },
      ],
      cta: { label: "Go", href: "/go" },
    };

    expect(formatter.parse(formatter.format(value))).toEqual(value);
  });

  test("omits an absent optional field on round-trip", () => {
    const { formatter } = richTemplate();
    if (!formatter) throw new Error("expected a formatter");

    const value = {
      headline: "Hi",
      count: 1,
      kind: "b" as const,
      tags: [],
      cards: [],
      cta: { label: "l", href: "h" },
    };

    const parsed = formatter.parse(formatter.format(value));
    expect(parsed).toEqual(value);
    expect("note" in (parsed as Record<string, unknown>)).toBe(false);
  });

  test("uses the section title as H1 and title-cases derived field labels", () => {
    const { formatter } = sectionToTemplate(
      "cta",
      defineSection(z.object({ buttonText: z.string() }), noop, {
        title: "Call To Action",
        description: "d",
      }),
    );
    if (!formatter) throw new Error("expected a formatter");

    const md = formatter.format({ buttonText: "Go" });
    expect(md).toContain("# Call To Action");
    expect(md).toContain("## Button Text");
  });

  test("throws at definition time on an unsupported field schema", () => {
    expect(() =>
      sectionToTemplate(
        "x",
        defineSection(z.object({ flag: z.boolean() }), noop, {
          title: "X",
          description: "d",
        }),
      ),
    ).toThrow(/schema type/);
  });

  test("throws when the section schema is not a zod object", () => {
    expect(() =>
      sectionToTemplate(
        "x",
        defineSection(z.string(), noop, { title: "X", description: "d" }),
      ),
    ).toThrow(/must be a zod object/);
  });
});

describe("sectionGroupToTemplates", () => {
  test("keys templates by section id", () => {
    const templates = sectionGroupToTemplates(
      sectionGroup("home", {
        hero: defineSection(z.object({ a: z.string() }), noop, {
          title: "Hero",
          description: "d",
        }),
        note: defineSection(z.object({ b: z.string() }), noop, {
          title: "Note",
          description: "d",
        }),
      }),
    );

    expect(Object.keys(templates)).toEqual(["hero", "note"]);
    expect(templates["hero"]?.name).toBe("hero");
  });
});
