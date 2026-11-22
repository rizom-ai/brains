import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  fieldMappingsFromSchema,
  StructuredContentFormatter,
} from "./structured-content";
import type { FieldMapping } from "./structured-content";

/**
 * The compact layout (docs/external-plugin-authoring.md, The stored format): no title line,
 * a single-line value as a labeled line, a group's one prose field as its
 * plain text, a keyed record as one heading per key, and nothing skipped.
 * It reads the sectioned layout too, so a file in the old layout imports.
 */

const ctaSchema = z.object({
  heading: z.string(),
  buttonText: z.string(),
  buttonLink: z.string(),
  subtitle: z.string().optional(),
});

const bodySchema = z.object({
  subtitle: z.string().optional(),
  sections: z
    .record(z.string(), z.object({ blurb: z.string().optional() }))
    .optional(),
  translations: z
    .record(
      z.string(),
      z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        cta: ctaSchema.optional(),
      }),
    )
    .optional(),
});

type Body = z.output<typeof bodySchema>;

const mappings: FieldMapping[] = [
  { key: "subtitle", label: "Call to action", type: "string" },
  {
    key: "sections",
    label: "Sections",
    type: "record",
    valueMappings: [{ key: "blurb", label: "Blurb", type: "string" }],
  },
  {
    key: "translations",
    label: "Translations",
    type: "record",
    valueMappings: [
      { key: "title", label: "Title", type: "string", line: true },
      { key: "description", label: "Description", type: "string", line: true },
      { key: "cta.heading", label: "CTA heading", type: "string", line: true },
      {
        key: "cta.buttonText",
        label: "CTA button text",
        type: "string",
        line: true,
      },
      {
        key: "cta.buttonLink",
        label: "CTA button link",
        type: "string",
        line: true,
      },
    ],
  },
];

const compact = new StructuredContentFormatter<Body>(bodySchema, {
  title: "Site",
  mappings,
  layout: "compact",
});

const body: Body = {
  subtitle: "Got an opinion? Let's talk.",
  sections: { essays: { blurb: "On institutions." }, about: {} },
  translations: {
    "pt-BR": {
      title: "Rizom",
      description: "Construa o agente.",
      cta: { heading: "Construa", buttonText: "Comece", buttonLink: "/pt/" },
    },
  },
};

const written = `## Call to action

Got an opinion? Let's talk.

## Sections

### essays

On institutions.

### about

## Translations

### pt-BR

- **Title:** Rizom
- **Description:** Construa o agente.
- **CTA heading:** Construa
- **CTA button text:** Comece
- **CTA button link:** /pt/
`;

describe("StructuredContentFormatter, compact layout", () => {
  it("writes labeled lines, plain prose and one heading per record key, with no title line", () => {
    expect(compact.format(body)).toBe(written);
  });

  it("reads back what it writes", () => {
    expect(compact.parse(written)).toEqual(body);
  });

  it("keeps a record key's case", () => {
    expect(Object.keys(compact.parse(written).translations ?? {})).toEqual([
      "pt-BR",
    ]);
  });

  it("reads the sectioned layout, title line and all", () => {
    const sectioned = `# Site

## Call to action

Got an opinion? Let's talk.

## Sections

### essays

#### Blurb

On institutions.

### about

## Translations

### pt-BR

#### Title

Rizom

#### Description

Construa o agente.

#### CTA heading

Construa

#### CTA button text

Comece

#### CTA button link

/pt/
`;
    expect(compact.parse(sectioned)).toEqual(body);
  });

  it("refuses a heading the type does not name", () => {
    expect(() =>
      compact.parse(`${written}\n## Sectons\n\nLost content.\n`),
    ).toThrow("Sectons");
  });

  it("refuses a named section stated twice", () => {
    expect(() =>
      compact.parse(`${written}\n## Call to action\n\nAgain.\n`),
    ).toThrow("Call to action");
  });

  it("refuses a labeled line the type does not name", () => {
    expect(() =>
      compact.parse(
        written.replace("- **Title:** Rizom", "- **Titel:** Rizom"),
      ),
    ).toThrow("Titel");
  });

  it("refuses a record key stated twice", () => {
    expect(() =>
      compact.parse(written.replace("### about", "### essays")),
    ).toThrow("essays");
  });

  it("writes prose under its own heading when it would read back as a labeled line", () => {
    const tricky: Body = {
      translations: { nl: { title: "Rizom" } },
      sections: { essays: { blurb: "- **Title:** not a field here" } },
    };
    expect(compact.parse(compact.format(tricky))).toEqual(tricky);
  });

  it("reads a numbered list of bold labels as prose, which a labeled line never is", () => {
    const steps: Body = {
      translations: { nl: { title: "Rizom" } },
      sections: {
        essays: {
          blurb:
            "1. **Align:** agree on the challenge.\n2. **Validate:** test it.",
        },
      },
    };
    expect(compact.parse(compact.format(steps))).toEqual(steps);
  });

  it("leaves the sectioned layout as it was for a formatter that does not opt in", () => {
    const sectioned = new StructuredContentFormatter<{ title: string }>(
      z.object({ title: z.string() }),
      {
        title: "Doc",
        mappings: [{ key: "title", label: "Title", type: "string" }],
      },
    );
    expect(sectioned.format({ title: "Hi" })).toBe("# Doc\n\n## Title\nHi\n");
    expect(
      sectioned.parse("# Doc\n\n## Title\nHi\n\n## Notes\nIgnored\n"),
    ).toEqual({
      title: "Hi",
    });
  });
});

/**
 * Lists of objects in the compact layout: an item whose type names a title
 * field is headed by its title; any other item by a stated item label and
 * its number. The mapping can be derived from the schema, its labels and
 * single-line marking schema metadata.
 */
describe("StructuredContentFormatter, compact lists of objects", () => {
  const swotSchema = z.object({
    strengths: z.array(z.object({ title: z.string(), detail: z.string() })),
    steps: z.array(z.object({ text: z.string() })).optional(),
  });
  type Swot = z.output<typeof swotSchema>;
  const swot = new StructuredContentFormatter<Swot>(swotSchema, {
    title: "SWOT",
    layout: "compact",
    mappings: [
      {
        key: "strengths",
        label: "Strengths",
        type: "array",
        itemType: "object",
        itemTitle: "title",
        itemMappings: [
          { key: "title", label: "Title", type: "string" },
          { key: "detail", label: "Detail", type: "string" },
        ],
      },
      {
        key: "steps",
        label: "Steps",
        type: "array",
        itemType: "object",
        itemLabel: "Step",
        itemMappings: [{ key: "text", label: "Text", type: "string" }],
      },
    ],
  });
  const data: Swot = {
    strengths: [
      { title: "Fast", detail: "Ships weekly." },
      { title: "Fast", detail: "Answers in a day." },
    ],
    steps: [{ text: "Draft." }, { text: "Review." }],
  };
  const markdown = `## Strengths

### Fast

Ships weekly.

### Fast

Answers in a day.

## Steps

### Step 1

Draft.

### Step 2

Review.
`;

  it("heads a titled item by its title and a numbered one by its stated label", () => {
    expect(swot.format(data)).toBe(markdown);
  });

  // Two items of one list may share a title.
  it("reads back what it writes, titles shared or not", () => {
    expect(swot.parse(markdown)).toEqual(data);
  });

  it("derives the mapping from the schema and its metadata", () => {
    const schema = z.object({
      name: z.string().meta({ label: "Name", line: true }),
      purpose: z.string().optional(),
      ctaButtonText: z.string().optional().meta({ line: true }),
      strengths: z
        .array(z.object({ title: z.string(), detail: z.string() }))
        .meta({ itemTitle: "title" }),
      steps: z
        .array(z.object({ text: z.string() }))
        .meta({ itemLabel: "Step" }),
      tags: z.array(z.string()).optional(),
      sections: z
        .record(z.string(), z.object({ blurb: z.string() }))
        .optional(),
    });
    expect(fieldMappingsFromSchema(schema)).toEqual([
      { key: "name", label: "Name", type: "string", line: true },
      { key: "purpose", label: "Purpose", type: "string" },
      {
        key: "ctaButtonText",
        label: "Cta button text",
        type: "string",
        line: true,
      },
      {
        key: "strengths",
        label: "Strengths",
        type: "array",
        itemType: "object",
        itemTitle: "title",
        itemMappings: [
          { key: "title", label: "Title", type: "string" },
          { key: "detail", label: "Detail", type: "string" },
        ],
      },
      {
        key: "steps",
        label: "Steps",
        type: "array",
        itemType: "object",
        itemLabel: "Step",
        itemMappings: [{ key: "text", label: "Text", type: "string" }],
      },
      { key: "tags", label: "Tags", type: "array", itemType: "string" },
      {
        key: "sections",
        label: "Sections",
        type: "record",
        valueMappings: [{ key: "blurb", label: "Blurb", type: "string" }],
      },
    ]);
  });
});
