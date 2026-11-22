import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { bodyFields } from "./body-fields";

/**
 * Fields a type's next stored form states above the body its author wrote
 * (a guide's opening and material over its own sections): read as the
 * leading sections their headings name, the author's body after them.
 */
const schema = z.object({
  title: z.string(),
  for: z.string(),
  material: z
    .array(z.object({ from: z.string(), how: z.string().meta({ line: true }) }))
    .meta({ itemTitle: "from" }),
});

const fields = bodyFields(schema, ["for", "material"], { place: "above" });

const values = {
  title: "Consultant",
  for: "Your expertise is locked in client work.",
  material: [{ from: "What you do", how: "Fill it in Studio" }],
};

const authored = "## Say who you are\n\nYour profile holds your tagline.\n";

const body = `## For

Your expertise is locked in client work.

## Material

### What you do

- **How:** Fill it in Studio

${authored}`;

describe("body fields above the author's body", () => {
  it("writes the fields' sections above the author's body", () => {
    expect(fields.write(values, authored)).toEqual({
      header: { title: "Consultant" },
      body,
    });
  });

  it("reads the leading sections the fields name, and the author's body after", () => {
    expect(fields.read({ title: "Consultant" }, body)).toEqual({
      header: values,
      lead: authored,
    });
  });

  // A heading inside a code block is not a section.
  it("reads a fenced heading as the author's text", () => {
    const fenced = "## For\n\nIt.\n\n```md\n## Material\n```\n";
    expect(fields.read({ title: "T" }, fenced)).toEqual({
      header: { title: "T", for: "It.\n\n```md\n## Material\n```" },
      lead: "",
    });
  });

  it("reads a body that opens on the author's own section as theirs", () => {
    expect(fields.read({ title: "T" }, authored)).toEqual({
      header: { title: "T" },
      lead: authored,
    });
  });
});

// An author's text that opens on no heading of its own sits under a stated
// one, or it would read as the last field's (a style guide's guidance).
describe("an author's text under its own heading, below fields above it", () => {
  const schema = z.object({
    name: z.string(),
    voice: z.string().optional(),
  });
  const fields = bodyFields(schema, ["voice"], {
    place: "above",
    leadHeading: "Guidance",
  });

  it("writes the text under the heading when it opens on none", () => {
    expect(
      fields.write({ name: "N", voice: "Warm." }, "Write plainly."),
    ).toEqual({
      header: { name: "N" },
      body: "## Voice\n\nWarm.\n\n## Guidance\n\nWrite plainly.\n",
    });
  });

  it("reads the text back without the heading", () => {
    expect(
      fields.read(
        { name: "N" },
        "## Voice\n\nWarm.\n\n## Guidance\n\nWrite plainly.\n",
      ),
    ).toEqual({
      header: { name: "N", voice: "Warm." },
      lead: "Write plainly.\n",
    });
  });

  it("leaves a text that opens on its own heading as it is", () => {
    expect(
      fields.write({ name: "N", voice: "Warm." }, "## Mine\n\nText.").body,
    ).toBe("## Voice\n\nWarm.\n\n## Mine\n\nText.\n");
  });
});

// A body read from under a header may open on a blank line; the author's
// text is written from its first line, so a write-back changes nothing.
describe("an author's text that opens on a blank line", () => {
  const fields = bodyFields(
    z.object({ name: z.string(), voice: z.string().optional() }),
    ["voice"],
    { place: "above", leadHeading: "Guidance" },
  );

  it("is written under its heading once, and reads back the same", () => {
    const written = fields.write(
      { name: "N", voice: "Precise." },
      "\nLong-form guidance.",
    );
    expect(written.body).toBe(
      "## Voice\n\nPrecise.\n\n## Guidance\n\nLong-form guidance.\n",
    );
    const read = fields.read(written.header, written.body);
    expect(fields.write(read.header, read.lead).body).toBe(written.body);
  });
});
