import {
  expectConfirmationArgs,
  expectToolConfirmation,
  expectToolError,
} from "@brains/mcp-service/test";
import { describe, expect, it } from "bun:test";
import type { CreateInput } from "@brains/entity-service";
import { createInputSchema } from "../../src/system/schemas";
import { uploadContext, uploadFixture } from "./upload-fixtures";

const draftUpload = {
  id: "upload-00000000-0000-4000-8000-000000000b01",
  filename: "draft-one.md",
  mediaType: "text/markdown",
  content: "# Field Notes\n\nFirst draft.",
};
const essayUpload = {
  id: "upload-00000000-0000-4000-8000-000000000b02",
  filename: "essay.md",
  mediaType: "text/markdown",
  content: "No heading here.",
};
const photoUpload = {
  id: "upload-00000000-0000-4000-8000-000000000b03",
  filename: "harbor.png",
  mediaType: "image/png",
  content: "png-bytes",
};

function item(
  upload: { id: string },
  transform: "extract-markdown" | "preserve",
  title?: string,
): Record<string, unknown> {
  return {
    id: upload.id,
    transform,
    ...(title !== undefined ? { title } : {}),
  };
}

function keepAll(): Record<string, unknown> {
  return {
    entityType: "note",
    source: {
      kind: "uploads",
      items: [
        item(draftUpload, "extract-markdown"),
        item(essayUpload, "extract-markdown"),
        item(photoUpload, "preserve"),
      ],
    },
  };
}

describe("system_create several uploads", () => {
  it("accepts several uploads as one source", () => {
    expect(createInputSchema.safeParse(keepAll()).success).toBe(true);
    expect(
      createInputSchema.safeParse({
        entityType: "note",
        source: { kind: "uploads", items: [] },
      }).success,
    ).toBe(false);
  });

  it("proposes every file under one confirmation, naming each title and type", async () => {
    const { tool, noteImports, preserved } = uploadFixture([
      draftUpload,
      essayUpload,
      photoUpload,
    ]);

    const pending = await tool.handler(keepAll(), uploadContext());

    const confirmation = expectToolConfirmation(pending);
    expect(confirmation.summary).toBe("Save 3 uploaded files?");
    expect(confirmation.preview).toContain(
      '1. draft-one.md → note "Field Notes"',
    );
    expect(confirmation.preview).toContain('2. essay.md → note "essay"');
    expect(confirmation.preview).toContain('3. harbor.png → image "harbor"');
    expect(noteImports).toEqual([]);
    expect(preserved).toEqual([]);
  });

  it("saves every file on one confirmation", async () => {
    const { tool, noteImports, preserved } = uploadFixture([
      draftUpload,
      essayUpload,
      photoUpload,
    ]);

    const pending = await tool.handler(keepAll(), uploadContext());
    const saved = await tool.handler(
      expectConfirmationArgs(pending),
      uploadContext(),
    );

    expect(saved).toMatchObject({
      success: true,
      data: {
        status: "generating",
        items: [
          {
            uploadId: draftUpload.id,
            filename: "draft-one.md",
            entityType: "note",
            title: "Field Notes",
          },
          {
            uploadId: essayUpload.id,
            filename: "essay.md",
            entityType: "note",
            title: "essay",
          },
          {
            uploadId: photoUpload.id,
            filename: "harbor.png",
            entityType: "image",
            title: "harbor",
          },
        ],
      },
    });
    expect(noteImports.map((input) => input.title)).toEqual([
      "Field Notes",
      "essay",
    ]);
    expect(preserved).toEqual([
      { upload: { id: photoUpload.id }, title: "harbor" },
    ]);
  });

  it("saves the other files when one fails, and says which were saved", async () => {
    const { tool, services, noteImports } = uploadFixture([
      draftUpload,
      photoUpload,
    ]);
    services.entityRegistry.registerUploadSaveHandler({
      entityType: "image",
      mediaTypes: ["image/png"],
      handler: async () => ({ success: false, error: "disk full" }),
    });

    const pending = await tool.handler(
      {
        entityType: "note",
        source: {
          kind: "uploads",
          items: [
            item(photoUpload, "preserve"),
            item(draftUpload, "extract-markdown"),
          ],
        },
      },
      uploadContext(),
    );
    const result = await tool.handler(
      expectConfirmationArgs(pending),
      uploadContext(),
    );

    expect(expectToolError(result).error).toBe(
      'Saved note "Field Notes". Could not save harbor.png: disk full.',
    );
    expect(noteImports.map((input) => input.title)).toEqual(["Field Notes"]);
  });

  it("keeps a title the user stated for one file", async () => {
    const { tool, noteImports } = uploadFixture([draftUpload, essayUpload]);

    const pending = await tool.handler(
      {
        entityType: "note",
        source: {
          kind: "uploads",
          items: [
            item(draftUpload, "extract-markdown"),
            item(essayUpload, "extract-markdown", "On Walking"),
          ],
        },
      },
      uploadContext(),
    );
    await tool.handler(expectConfirmationArgs(pending), uploadContext());

    expect(noteImports.map((input) => input.title)).toEqual([
      "Field Notes",
      "On Walking",
    ]);
  });

  it("refuses confirmed files that differ from the ones proposed", async () => {
    const { tool, noteImports } = uploadFixture([draftUpload, essayUpload]);
    const pending = await tool.handler(
      {
        entityType: "note",
        source: {
          kind: "uploads",
          items: [
            item(draftUpload, "extract-markdown"),
            item(essayUpload, "extract-markdown"),
          ],
        },
      },
      uploadContext(),
    );
    const args = expectConfirmationArgs(pending);

    const swapped = await tool.handler(
      {
        ...args,
        source: {
          kind: "uploads",
          items: [
            item(draftUpload, "extract-markdown", "Field Notes"),
            item(essayUpload, "extract-markdown", "Renamed"),
          ],
        },
      },
      uploadContext(),
    );

    expect(expectToolError(swapped).error).toContain(
      "do not match the pending approval",
    );
    expect(noteImports).toEqual([]);
  });

  it("refuses the whole request when one file cannot be saved", async () => {
    const { tool } = uploadFixture([draftUpload]);

    const result = await tool.handler(
      {
        entityType: "note",
        source: {
          kind: "uploads",
          items: [
            item(draftUpload, "extract-markdown"),
            item(essayUpload, "extract-markdown"),
          ],
        },
      },
      uploadContext(),
    );

    expect(expectToolError(result).error).toContain(
      `Upload 2 of 2 (${essayUpload.id})`,
    );
  });

  it("refuses two files that would be saved as the same entity", async () => {
    const { tool } = uploadFixture([draftUpload, essayUpload]);

    const result = await tool.handler(
      {
        entityType: "note",
        source: {
          kind: "uploads",
          items: [
            item(draftUpload, "extract-markdown"),
            item(essayUpload, "extract-markdown", "Field Notes"),
          ],
        },
      },
      uploadContext(),
    );

    expect(expectToolError(result).error).toContain(
      'draft-one.md and essay.md would both be saved as note "Field Notes"',
    );
  });

  it("refuses a shared title for several uploads", async () => {
    const { tool } = uploadFixture([draftUpload, essayUpload]);

    const result = await tool.handler(
      { ...keepAll(), title: "Everything" },
      uploadContext(),
    );

    expect(expectToolError(result).error).toContain("source.items");
  });
});

const slownessUpload = {
  id: "upload-00000000-0000-4000-8000-000000000b11",
  filename: "on-slowness.md",
  mediaType: "text/markdown",
  content: "# On Slowness\n\nI write slowly.",
};
const quietUpload = {
  id: "upload-00000000-0000-4000-8000-000000000b12",
  filename: "quiet-tools.md",
  mediaType: "text/markdown",
  content: "# Quiet Tools\n\nThe best tools disappear.",
};
const reportUpload = {
  id: "upload-00000000-0000-4000-8000-000000000b13",
  filename: "field-report.pdf",
  mediaType: "application/pdf",
  content: "%PDF-1.4",
};

/** A post type that keeps the writer's own text, as the blog plugin does. */
function withPostType(
  fixture: ReturnType<typeof uploadFixture>,
): CreateInput[] {
  const posts: CreateInput[] = [];
  fixture.services.registerEntityTypes(["post"]);
  fixture.services.entityRegistry.registerCreateInterceptor(
    "post",
    async (input) => {
      posts.push(input);
      const entityId =
        input.title?.toLowerCase().replace(/\s+/g, "-") ?? "post";
      return {
        kind: "handled",
        result: {
          success: true,
          data: { entityId, status: "generating", jobId: `job-${entityId}` },
        },
      };
    },
  );
  return posts;
}

describe("system_create uploads as another type's text", () => {
  it("saves one text upload as a post from its text", async () => {
    const fixture = uploadFixture([slownessUpload]);
    const posts = withPostType(fixture);

    const pending = await fixture.tool.handler(
      {
        entityType: "post",
        source: {
          kind: "upload",
          id: slownessUpload.id,
          transform: "extract-markdown",
        },
        fields: { status: "published", publishedAt: "2025-03-12" },
      },
      uploadContext(),
    );
    expect(expectToolConfirmation(pending).summary).toBe(
      'Create "On Slowness"?',
    );
    await fixture.tool.handler(
      expectConfirmationArgs(pending),
      uploadContext(),
    );

    expect(posts).toEqual([
      {
        entityType: "post",
        title: "On Slowness",
        content: slownessUpload.content,
        fields: { status: "published", publishedAt: "2025-03-12" },
      },
    ]);
  });

  it("saves several essays as posts, each with its own stated fields", async () => {
    const fixture = uploadFixture([slownessUpload, quietUpload]);
    const posts = withPostType(fixture);

    const pending = await fixture.tool.handler(
      {
        entityType: "post",
        fields: { status: "published" },
        source: {
          kind: "uploads",
          items: [
            {
              ...item(slownessUpload, "extract-markdown"),
              fields: {
                publishedAt: "2025-03-12",
                canonicalUrl: "https://example.com/on-slowness",
              },
            },
            {
              ...item(quietUpload, "extract-markdown"),
              fields: {
                publishedAt: "2025-06-04",
                canonicalUrl: "https://example.com/quiet-tools",
              },
            },
          ],
        },
      },
      uploadContext(),
    );
    const confirmation = expectToolConfirmation(pending);
    expect(confirmation.preview).toContain(
      '1. on-slowness.md → post "On Slowness"',
    );
    expect(confirmation.preview).toContain(
      "   status: published, publishedAt: 2025-03-12, canonicalUrl: https://example.com/on-slowness",
    );
    expect(confirmation.preview).toContain(
      '2. quiet-tools.md → post "Quiet Tools"',
    );

    const saved = await fixture.tool.handler(
      expectConfirmationArgs(pending),
      uploadContext(),
    );

    expect(saved).toMatchObject({
      success: true,
      data: {
        items: [
          { entityType: "post", title: "On Slowness" },
          { entityType: "post", title: "Quiet Tools" },
        ],
      },
    });
    expect(posts).toEqual([
      {
        entityType: "post",
        title: "On Slowness",
        content: slownessUpload.content,
        fields: {
          status: "published",
          publishedAt: "2025-03-12",
          canonicalUrl: "https://example.com/on-slowness",
        },
      },
      {
        entityType: "post",
        title: "Quiet Tools",
        content: quietUpload.content,
        fields: {
          status: "published",
          publishedAt: "2025-06-04",
          canonicalUrl: "https://example.com/quiet-tools",
        },
      },
    ]);
  });

  it("imports PDFs as notes beside a Markdown file", async () => {
    const { tool, noteImports, preserved } = uploadFixture([
      reportUpload,
      draftUpload,
    ]);

    const pending = await tool.handler(
      {
        entityType: "note",
        source: {
          kind: "uploads",
          items: [
            item(reportUpload, "extract-markdown"),
            item(draftUpload, "extract-markdown"),
          ],
        },
      },
      uploadContext(),
    );
    await tool.handler(expectConfirmationArgs(pending), uploadContext());

    expect(
      noteImports.map((input) => [input.title, input.from, input.transform]),
    ).toEqual([
      [
        "field-report",
        { kind: "upload", id: reportUpload.id },
        "extract-markdown",
      ],
      [
        "Field Notes",
        { kind: "upload", id: draftUpload.id },
        "extract-markdown",
      ],
    ]);
    expect(preserved).toEqual([]);
  });

  it("refuses a PDF as a post, naming what a PDF can be saved as", async () => {
    const fixture = uploadFixture([reportUpload]);
    withPostType(fixture);

    const result = await fixture.tool.handler(
      {
        entityType: "post",
        source: {
          kind: "upload",
          id: reportUpload.id,
          transform: "extract-markdown",
        },
      },
      uploadContext(),
    );

    expect(expectToolError(result).error).toBe(
      'A post takes the text of a text upload; field-report.pdf (application/pdf) is not text. Import it as a note, or keep the file itself with transform "preserve".',
    );
  });
});

describe("system_create several uploads checked by their type", () => {
  it("checks each file before the one confirmation, showing what the check filled in", async () => {
    const fixture = uploadFixture([slownessUpload, quietUpload]);
    const posts = withPostType(fixture);
    const checked: CreateInput[] = [];
    fixture.services.entityRegistry.registerCreateCheck(
      "post",
      async (input) => {
        checked.push(input);
        return { kind: "ready", fields: { author: "Alex Chen" } };
      },
    );

    const pending = await fixture.tool.handler(
      {
        entityType: "post",
        source: {
          kind: "uploads",
          items: [
            item(slownessUpload, "extract-markdown"),
            item(quietUpload, "extract-markdown"),
          ],
        },
      },
      uploadContext(),
    );

    expect(checked.map((input) => input.content)).toEqual([
      slownessUpload.content,
      quietUpload.content,
    ]);
    expect(expectToolConfirmation(pending).preview).toContain(
      '1. on-slowness.md → post "On Slowness"\n   author: Alex Chen',
    );
    await fixture.tool.handler(
      expectConfirmationArgs(pending),
      uploadContext(),
    );

    expect(checked).toHaveLength(2);
    expect(posts.map((input) => input.fields)).toEqual([
      { author: "Alex Chen" },
      { author: "Alex Chen" },
    ]);
  });

  it("asks the type's question about one file and keeps the others in the retry", async () => {
    const fixture = uploadFixture([slownessUpload, quietUpload]);
    withPostType(fixture);
    fixture.services.entityRegistry.registerCreateCheck(
      "post",
      async (input) =>
        input.title === "Quiet Tools" && !input.fields?.["publishedAt"]
          ? {
              kind: "question",
              asks: "fields",
              question: "When was Quiet Tools first published?",
              answerWith: "Pass the answer as fields { publishedAt }.",
            }
          : { kind: "ready" },
    );
    const source = {
      kind: "uploads",
      items: [
        item(slownessUpload, "extract-markdown"),
        item(quietUpload, "extract-markdown"),
      ],
    };

    const result = await fixture.tool.handler(
      { entityType: "post", source },
      uploadContext(),
    );

    const { error } = expectToolError(result);
    expect(error).toContain(
      `Upload 2 of 2 (${quietUpload.id}): Nothing was saved and no approval was requested.`,
    );
    expect(error).toContain('"When was Quiet Tools first published?"');
    expect(error).toContain(
      `pass source ${JSON.stringify(source)}, with the answer about this file in its item.`,
    );
    expect(error).not.toContain('"kind":"upload","upload"');
  });
});
