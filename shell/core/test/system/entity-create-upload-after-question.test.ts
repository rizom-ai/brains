import { expectConfirmationArgs } from "@brains/mcp-service/test";
import { describe, expect, it } from "bun:test";
import type { CreateInput } from "@brains/entity-service";
import { uploadContext, uploadFixture } from "./upload-fixtures";

const draftUpload = {
  id: "upload-00000000-0000-4000-8000-000000000d01",
  filename: "draft.md",
  mediaType: "text/markdown",
  content: "# Harbor Survey\n\nThe survey starts at dawn.",
};
const essayUpload = {
  id: "upload-00000000-0000-4000-8000-000000000d02",
  filename: "essay.md",
  mediaType: "text/markdown",
  content: "# On Tides\n\nTides turn twice a day.",
};

/**
 * A note type that asks the user a question before saving pasted text, and
 * imports uploads as the fixture does.
 */
function askingFixture(): ReturnType<typeof uploadFixture> & {
  calls: CreateInput[];
} {
  const fixture = uploadFixture([draftUpload, essayUpload]);
  const calls: CreateInput[] = [];
  fixture.services.entityRegistry.registerCreateCheck("note", async (input) =>
    input.content !== undefined
      ? {
          kind: "question",
          asks: "fields",
          question: "Which year was this?",
          answerWith: "Pass the answer as fields { year }.",
        }
      : { kind: "ready" },
  );
  fixture.services.entityRegistry.registerCreateInterceptor(
    "note",
    async (input) => {
      calls.push(input);
      return {
        kind: "handled",
        result: {
          success: true,
          data: { entityId: input.title ?? "note", status: "generating" },
        },
      };
    },
  );
  return { ...fixture, calls };
}

async function askAboutPastedText(
  tool: ReturnType<typeof uploadFixture>["tool"],
): Promise<void> {
  const refused = await tool.handler(
    {
      entityType: "note",
      source: {
        kind: "text",
        content: "Pasted text the note type asks about.",
      },
    },
    uploadContext(),
  );
  expect(refused).toMatchObject({ success: false });
}

describe("an upload saved after a clarifying question", () => {
  it("saves the upload, not the text pinned by the question", async () => {
    const { tool, calls } = askingFixture();
    await askAboutPastedText(tool);

    const pending = await tool.handler(
      {
        entityType: "note",
        source: {
          kind: "upload",
          id: draftUpload.id,
          transform: "extract-markdown",
        },
      },
      uploadContext(),
    );
    const args = expectConfirmationArgs(pending);
    expect(args["source"]).toMatchObject({ kind: "upload" });
    const saved = await tool.handler(args, uploadContext());

    expect(saved).toMatchObject({ success: true });
    const imported = calls.at(-1);
    expect(imported?.from).toEqual({ kind: "upload", id: draftUpload.id });
    expect(imported?.content).toBeUndefined();
    expect(imported?.title).toBe("Harbor Survey");
  });

  it("saves every upload of several, not the pinned text", async () => {
    const { tool, calls } = askingFixture();
    await askAboutPastedText(tool);

    const pending = await tool.handler(
      {
        entityType: "note",
        source: {
          kind: "uploads",
          items: [
            {
              id: draftUpload.id,
              transform: "extract-markdown",
            },
            {
              id: essayUpload.id,
              transform: "extract-markdown",
            },
          ],
        },
      },
      uploadContext(),
    );
    const saved = await tool.handler(
      expectConfirmationArgs(pending),
      uploadContext(),
    );

    expect(saved).toMatchObject({ success: true });
    const imports = calls.slice(-2);
    expect(imports.map((input) => input.from)).toEqual([
      { kind: "upload", id: draftUpload.id },
      { kind: "upload", id: essayUpload.id },
    ]);
    expect(imports.map((input) => input.content)).toEqual([
      undefined,
      undefined,
    ]);
  });
});
