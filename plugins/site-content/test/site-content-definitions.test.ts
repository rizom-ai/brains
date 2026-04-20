import { describe, expect, it } from "bun:test";
import type { SiteContentDefinition } from "../src/definitions";
import { createSiteContentTemplates } from "../src/lib/site-content-definitions";

const TestLayout = (): never => null as never;

describe("createSiteContentTemplates", () => {
  it("derives schema and formatter from section field definitions", () => {
    const definition: SiteContentDefinition = {
      namespace: "landing-page",
      sections: {
        hero: {
          description: "Hero section",
          title: "Hero Section",
          layout: TestLayout,
          fields: {
            headline: { label: "Headline", type: "string" },
            subhead: { label: "Subhead", type: "string", optional: true },
            cards: {
              label: "Cards",
              type: "array",
              length: 2,
              items: {
                label: "Card",
                type: "object",
                fields: {
                  variant: {
                    label: "Variant",
                    type: "enum",
                    options: ["alpha", "beta"],
                  },
                  title: { label: "Title", type: "string" },
                },
              },
            },
          },
        },
      },
    };

    const templates = createSiteContentTemplates(definition);
    const template = templates["hero"];
    expect(template).toBeDefined();
    if (!template) {
      throw new Error("Expected hero template to be created");
    }
    const data = {
      headline: "Build the agent that represents you",
      subhead: "Own your knowledge, own your agent.",
      cards: [
        { variant: "alpha", title: "First" },
        { variant: "beta", title: "Second" },
      ],
    };

    expect(
      template.schema.parse({
        headline: "Build the agent that represents you",
        cards: [
          { variant: "alpha", title: "First" },
          { variant: "beta", title: "Second" },
        ],
      }),
    ).toEqual({
      headline: "Build the agent that represents you",
      cards: [
        { variant: "alpha", title: "First" },
        { variant: "beta", title: "Second" },
      ],
    });
    expect(template.schema.parse(data)).toEqual(data);
    expect(() =>
      template.schema.parse({
        headline: "Bad",
        cards: [{ variant: "nope", title: "Wrong" }],
      }),
    ).toThrow();

    expect(template.formatter).toBeDefined();
    const markdown = template.formatter?.format(data) ?? "";
    expect(markdown).toContain("# Hero Section");
    expect(markdown).toContain("## Headline");
    expect(markdown).toContain("### Card 1");

    expect(template.formatter?.parse(markdown)).toEqual(data);
  });
});
