import { describe, expect, it } from "bun:test";
import {
  redactUploadRefs,
  redactUploadRefsInStructuredCard,
} from "../../src/message-interface/upload-redaction";

describe("redactUploadRefs", () => {
  it("replaces nested upload refs with a safe label", () => {
    expect(
      redactUploadRefs({
        entityType: "document",
        source: { kind: "upload", id: "upload-123" },
        nested: [{ ref: { kind: "upload", id: "upload-456" } }],
      }),
    ).toEqual({
      entityType: "document",
      source: "uploaded file",
      nested: [{ ref: "uploaded file" }],
    });
  });

  it("hides the upload id of each file a save of several uploads lists", () => {
    expect(
      redactUploadRefs({
        entityType: "note",
        source: {
          kind: "uploads",
          items: [
            { id: "upload-123", transform: "extract-markdown" },
            { id: "upload-456", transform: "preserve", title: "Harbor" },
          ],
        },
      }),
    ).toEqual({
      entityType: "note",
      source: {
        kind: "uploads",
        items: [
          { id: "uploaded file", transform: "extract-markdown" },
          { id: "uploaded file", transform: "preserve", title: "Harbor" },
        ],
      },
    });
  });

  it("leaves non-upload records intact", () => {
    expect(redactUploadRefs({ kind: "entity", id: "note-1" })).toEqual({
      kind: "entity",
      id: "note-1",
    });
  });
});

describe("redactUploadRefsInStructuredCard", () => {
  it("redacts tool approval input and output upload refs", () => {
    expect(
      redactUploadRefsInStructuredCard({
        kind: "tool-approval",
        id: "approval-1",
        toolName: "system_create",
        summary: "Create document",
        state: "output-available",
        input: { source: { kind: "upload", id: "upload-123" } },
        output: {
          entityId: "doc-1",
          source: { kind: "upload", id: "upload-123" },
        },
      }),
    ).toEqual({
      kind: "tool-approval",
      id: "approval-1",
      toolName: "system_create",
      summary: "Create document",
      state: "output-available",
      input: { source: "uploaded file" },
      output: { entityId: "doc-1", source: "uploaded file" },
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
