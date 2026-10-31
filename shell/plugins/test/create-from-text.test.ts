import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import type { CreateInput } from "@brains/entity-service";
import {
  continueWithEntityText,
  readEntityText,
} from "../src/entity/create-from-text";

const fieldsSchema = z.object({
  description: z.string().trim().min(1).optional(),
  year: z.number().int().optional(),
});

const completeSchema = z.object({
  title: z.string(),
  status: z.string(),
  description: z.string(),
});

const options = {
  noun: "project",
  fieldsSchema,
  isComplete: (frontmatter: Record<string, unknown>): boolean =>
    completeSchema.safeParse(frontmatter).success,
};

const text =
  "# Field notes\n\nWe mapped the river by canoe.\n\n## What we learned\n\nSlow is fast.";
const body =
  "We mapped the river by canoe.\n\n## What we learned\n\nSlow is fast.";

function read(
  input: Partial<CreateInput>,
  overrides: Partial<typeof options> & { keepTitleHeading?: boolean } = {},
): ReturnType<typeof readEntityText<typeof fieldsSchema>> {
  return readEntityText(
    { entityType: "project", ...input },
    { ...options, ...overrides },
  );
}

describe("readEntityText", () => {
  it("titles the text from its leading # heading and drops that heading from the body", () => {
    expect(read({ content: text })).toEqual({
      kind: "text",
      text: { title: "Field notes", body, fields: {} },
    });
  });

  it("drops a leading heading that repeats the stated title", () => {
    expect(read({ title: "Field Notes", content: text })).toEqual({
      kind: "text",
      text: { title: "Field Notes", body, fields: {} },
    });
  });

  it("keeps a leading heading that differs from the stated title", () => {
    expect(read({ title: "River survey", content: text })).toEqual({
      kind: "text",
      text: { title: "River survey", body: text, fields: {} },
    });
  });

  it("keeps the title heading in the body when the type shows it (a deck's title slide)", () => {
    expect(read({ content: text }, { keepTitleHeading: true })).toEqual({
      kind: "text",
      text: { title: "Field notes", body: text, fields: {} },
    });
  });

  it("asks for a title when the text has none", () => {
    const result = read({ content: "Just a paragraph." });
    expect(result.kind).toBe("error");
    expect(JSON.stringify(result)).toContain("title");
  });

  it("refuses text that is only a title", () => {
    expect(read({ content: "# Only a title\n" }).kind).toBe("error");
  });

  it("merges fields the text's frontmatter states with fields the caller states", () => {
    expect(
      read({
        content: `---\ndescription: From the text.\nyear: 2019\n---\n\n${text}`,
        fields: { year: 2021 },
      }),
    ).toEqual({
      kind: "text",
      text: {
        title: "Field notes",
        body,
        fields: { description: "From the text.", year: 2021 },
      },
    });
  });

  it("titles the text from its frontmatter title", () => {
    expect(
      read({ content: "---\ntitle: From frontmatter\n---\n\nPlain body." }),
    ).toEqual({
      kind: "text",
      text: { title: "From frontmatter", body: "Plain body.", fields: {} },
    });
  });

  it("refuses caller fields the type does not have", () => {
    const result = read({ content: text, fields: { mood: "calm" } });
    expect(result.kind).toBe("error");
    expect(JSON.stringify(result)).toContain("mood");
  });

  it("refuses invalid stated values", () => {
    expect(read({ content: text, fields: { year: "soon" } }).kind).toBe(
      "error",
    );
  });

  it("leaves a complete document to the normal create", () => {
    expect(
      read({
        content:
          "---\ntitle: Done\nstatus: draft\ndescription: Ready.\n---\n\nBody",
      }),
    ).toEqual({ kind: "not-text" });
  });

  it("leaves prompt, URL and upload creates alone", () => {
    expect(read({ prompt: "Write about X" })).toEqual({ kind: "not-text" });
    expect(read({ url: "https://example.com" })).toEqual({ kind: "not-text" });
    expect(read({ from: { kind: "upload", id: "u1" }, content: text })).toEqual(
      { kind: "not-text" },
    );
  });
});

describe("continueWithEntityText", () => {
  it("continues the create with the full document, titled, and the stated fields applied", () => {
    const input: CreateInput = {
      entityType: "project",
      content: text,
      visibility: "shared",
      fields: { year: 2021 },
    };
    expect(
      continueWithEntityText(input, {
        title: "Field notes",
        frontmatter: { title: "Field notes", status: "draft", year: 2021 },
        body,
      }),
    ).toEqual({
      kind: "continue",
      input: {
        entityType: "project",
        title: "Field notes",
        visibility: "shared",
        content: `---\ntitle: Field notes\nstatus: draft\nyear: 2021\n---\n${body}\n`,
      },
    });
  });
});
