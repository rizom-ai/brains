import {
  expectConfirmationArgs,
  expectToolConfirmation,
  expectToolError,
} from "@brains/mcp-service/test";
import { describe, expect, it } from "bun:test";
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
    upload: { kind: "upload", id: upload.id },
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
            filename: "draft-one.md",
            entityType: "note",
            title: "Field Notes",
          },
          { filename: "essay.md", entityType: "note", title: "essay" },
          { filename: "harbor.png", entityType: "image", title: "harbor" },
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
