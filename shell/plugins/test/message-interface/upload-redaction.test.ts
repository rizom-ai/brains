import { describe, expect, it } from "bun:test";
import {
  redactUploadRefs,
  redactUploadRefsInStructuredCard,
} from "../../src/message-interface/upload-redaction";

const draft = "upload-00000000-0000-4000-8000-000000000b01";
const photo = "upload-00000000-0000-4000-8000-000000000b03";

describe("redactUploadRefs", () => {
  it("hides every upload id, wherever it sits", () => {
    expect(
      redactUploadRefs({
        source: { kind: "upload", id: draft, transform: "preserve" },
        files: {
          kind: "uploads",
          items: [
            { id: draft, transform: "extract-markdown" },
            { id: photo, transform: "preserve" },
          ],
        },
        data: { entityId: "harbor", entityType: "image", uploadId: photo },
        error: `Upload 2 of 2 (${photo}): could not read it`,
      }),
    ).toEqual({
      source: { kind: "upload", id: "uploaded file", transform: "preserve" },
      files: {
        kind: "uploads",
        items: [
          { id: "uploaded file", transform: "extract-markdown" },
          { id: "uploaded file", transform: "preserve" },
        ],
      },
      data: {
        entityId: "harbor",
        entityType: "image",
        uploadId: "uploaded file",
      },
      error: "Upload 2 of 2 (uploaded file): could not read it",
    });
  });

  it("leaves strings that only look like upload ids", () => {
    const value = {
      kind: "upload",
      id: "upload-123",
      entityId: "upload-guide",
      note: "upload-00000000-0000-0000-0000-000000000000",
    };
    expect(redactUploadRefs(value)).toEqual(value);
  });
});

describe("redactUploadRefsInStructuredCard", () => {
  it("redacts tool approval input and output upload ids", () => {
    expect(
      redactUploadRefsInStructuredCard({
        kind: "tool-approval",
        id: "approval-1",
        toolName: "system_create",
        summary: "Create document",
        state: "output-available",
        input: { source: { kind: "upload", id: draft, transform: "preserve" } },
        output: { entityId: "doc-1", uploadId: draft },
      }),
    ).toEqual({
      kind: "tool-approval",
      id: "approval-1",
      toolName: "system_create",
      summary: "Create document",
      state: "output-available",
      input: {
        source: { kind: "upload", id: "uploaded file", transform: "preserve" },
      },
      output: { entityId: "doc-1", uploadId: "uploaded file" },
    });
  });

  it("leaves non-tool cards unchanged", () => {
    const card = {
      kind: "sources" as const,
      id: "sources-1",
      sources: [{ id: "source-1", source: "notes" }],
    };

    expect(redactUploadRefsInStructuredCard(card)).toEqual(card);
  });
});
