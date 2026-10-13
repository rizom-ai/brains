import { describe, expect, it } from "bun:test";
import { expectBodyRoundTrip } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createSiteContentTemplate } from "../src/content-definitions";
import { defineSection } from "@rizom/site";
import { sectionToTemplate } from "../src/section-templates";
import { createElement as h } from "react";

const noop = (): ReturnType<typeof h> => h("span", null);
const section = {
  title: "Metrics",
  description: "Typed metric values and optional copy",
  layout: noop,
  fields: {
    values: {
      type: "array",
      label: "Values",
      items: { type: "number", label: "Value" },
    },
    tags: {
      type: "array",
      label: "Tags",
      optional: true,
      items: { type: "string", label: "Tag" },
    },
    callout: {
      type: "object",
      label: "Callout",
      optional: true,
      fields: { text: { type: "string", label: "Text" } },
    },
  },
} as const;

describe("site content body codecs", () => {
  it("round-trips a decoded declarative section, including absent collections", () => {
    const template = createSiteContentTemplate("metrics", section);
    if (!template.formatter) throw new Error("Missing section formatter");
    const decoded = template.schema.parse({ values: [0, -3.5, 42] });
    expect(decoded).toEqual({
      values: [0, -3.5, 42],
      tags: null,
      callout: null,
    });
    expectBodyRoundTrip(template.formatter, decoded);
  });

  it("round-trips populated declarative collections", () => {
    const template = createSiteContentTemplate("metrics", section);
    if (!template.formatter) throw new Error("Missing section formatter");
    expectBodyRoundTrip(
      template.formatter,
      template.schema.parse({
        values: [3],
        tags: ["measured"],
        callout: { text: "Measured locally" },
      }),
    );
  });

  it("round-trips a schema-first section without moving its JSON Schema to the codec", () => {
    const schema = z.object({
      values: z.array(z.number()),
      tags: z.array(z.string()).nullable().default(null),
    });
    const template = sectionToTemplate(
      "metrics",
      defineSection(schema, noop, {
        title: "Metrics",
        description: "Schema-first metrics",
      }),
    );
    if (!template.formatter) throw new Error("Missing section formatter");
    expectBodyRoundTrip(template.formatter, schema.parse({ values: [1, 2.5] }));
    expect(z.toJSONSchema(template.schema, { io: "input" }).type).toBe(
      "object",
    );
    expect(() =>
      template.formatter?.format({ values: ["not a number"] }),
    ).toThrow(/values/);
  });
});
