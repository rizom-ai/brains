import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { bodyFieldsCodec } from "../src";

/**
 * A type whose new stored form (docs/external-plugin-authoring.md, The stored format) states some
 * header fields in its body: one section per field, under the text its
 * author wrote. It reads either form and writes the new one.
 */
const metadata = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  examples: z.array(z.string()),
});

const codec = bodyFieldsCodec({
  metadata,
  bodyFields: ["description", "examples"],
});

const fields = {
  name: "Facilitate workshops",
  description: "Design and run workshops.",
  tags: ["facilitation"],
  examples: ["Plan a strategy day.", "Run a retrospective."],
};

const nextBody = `## Description

Design and run workshops.

## Examples

- Plan a strategy day.
- Run a retrospective.
`;

describe("a codec that moves header fields to the body", () => {
  it("reads the current form: every field in the header", () => {
    expect(codec.decode({ content: "", frontmatter: fields })).toEqual({
      content: "",
      metadata: fields,
    });
  });

  it("reads the next form: the moved fields from the body's sections", () => {
    expect(
      codec.decode({
        content: nextBody,
        frontmatter: { name: fields.name, tags: fields.tags },
      }),
    ).toEqual({ content: "", metadata: fields });
  });

  it("keeps the text an author wrote above the sections", () => {
    expect(
      codec.decode({
        content: `Written by hand.\n\n${nextBody}`,
        frontmatter: { name: fields.name, tags: fields.tags },
      }),
    ).toEqual({ content: "Written by hand.\n", metadata: fields });
  });

  // An author's own sections that do not read as the fields are their text.
  it("reads sections that are not the fields as the author's text", () => {
    const body = "## Notes\n\nMine.\n";
    expect(codec.decode({ content: body, frontmatter: fields }).content).toBe(
      body,
    );
  });

  it("writes the moved fields as body sections", () => {
    expect(
      codec.encode?.({ content: "Written by hand.", metadata: fields }),
    ).toEqual({
      content: `Written by hand.\n\n${nextBody}`,
      frontmatter: { name: fields.name, tags: fields.tags },
    });
  });
});
