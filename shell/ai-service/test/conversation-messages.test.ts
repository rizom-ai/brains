import { describe, expect, it } from "bun:test";
import {
  buildMessageWithAttachments,
  collectUploadRefsFromMessages,
  resolveConversationUploadRefs,
} from "../src/conversation-messages";

describe("collectUploadRefsFromMessages", () => {
  it("collects prior upload refs from stored conversation metadata without inferring intent", () => {
    const refs = collectUploadRefsFromMessages([
      {
        id: "message-1",
        conversationId: "conversation-1",
        role: "user",
        content: "",
        metadata: JSON.stringify({
          attachments: [
            {
              kind: "file",
              filename: "distributed-systems-primer.pdf",
              mediaType: "application/pdf",
              source: {
                kind: "web-chat-upload",
                id: "upload-00000000-0000-4000-8000-000000000401",
              },
            },
          ],
        }),
        timestamp: new Date().toISOString(),
      },
    ]);

    expect(refs).toEqual([
      {
        filename: "distributed-systems-primer.pdf",
        mediaType: "application/pdf",
        source: {
          kind: "web-chat-upload",
          id: "upload-00000000-0000-4000-8000-000000000401",
        },
      },
    ]);
  });
});

describe("resolveConversationUploadRefs", () => {
  const uploadRefs = [
    {
      filename: "alpha-guide.pdf",
      mediaType: "application/pdf",
      source: {
        kind: "web-chat-upload",
        id: "upload-alpha",
      },
    },
    {
      filename: "beta-diagram.png",
      mediaType: "image/png",
      source: {
        kind: "web-chat-upload",
        id: "upload-beta",
      },
    },
  ];

  it("selects a prior upload by exact filename mention", () => {
    const alpha = uploadRefs[0];
    if (!alpha) throw new Error("Expected alpha upload fixture");

    expect(
      resolveConversationUploadRefs("save alpha-guide.pdf", uploadRefs),
    ).toEqual({ kind: "selected", refs: [alpha] });
  });

  it("selects a prior upload by explicit position", () => {
    const beta = uploadRefs[1];
    if (!beta) throw new Error("Expected beta upload fixture");

    expect(
      resolveConversationUploadRefs("use the latest one", uploadRefs),
    ).toEqual({ kind: "selected", refs: [beta] });
  });

  it("returns a clarification state for multiple refs without a deterministic selector", () => {
    expect(resolveConversationUploadRefs("save it", uploadRefs)).toEqual({
      kind: "clarify",
      refs: uploadRefs,
    });
  });
});

describe("buildMessageWithAttachments", () => {
  it("includes model-visible prior upload refs without same-turn attachments", () => {
    const content = buildMessageWithAttachments(
      "turn it into a note",
      undefined,
      {
        uploadRefs: [
          {
            filename: "distributed-systems-primer.pdf",
            mediaType: "application/pdf",
            source: {
              kind: "web-chat-upload",
              id: "upload-00000000-0000-4000-8000-000000000401",
            },
          },
        ],
      },
    );

    expect(content).toBe(
      'turn it into a note\n\nAvailable runtime upload refs from this conversation. When the user asks to act on the upload, these refs are the source of truth; do not substitute existing entities or retrieved memory with similar titles. For raw file saves/promotions, call system_create with upload: { kind: "web-chat-upload", id: <upload ID> } and the appropriate entityType (PDF -> document, image -> image). If the request names document, PDF, file, image, save, or promote, use raw promotion and omit transform. For markdown/note extraction, call system_create with entityType: "base", upload, and transform: "extract-markdown" only when the request names note, markdown, or text extraction.\n- distributed-systems-primer.pdf: upload { kind: "web-chat-upload", id: "upload-00000000-0000-4000-8000-000000000401" }; raw promotion call: system_create({ entityType: "document", upload }) and omit transform',
    );
  });

  it("includes model-visible upload refs for file attachments", () => {
    const content = buildMessageWithAttachments("save it as a document", [
      {
        kind: "file",
        filename: "brief.pdf",
        mediaType: "application/pdf",
        data: new Uint8Array([1, 2, 3]),
        sizeBytes: 3,
        source: {
          kind: "web-chat-upload",
          id: "upload-00000000-0000-4000-8000-000000000401",
        },
      },
    ]);

    expect(content).toEqual([
      {
        type: "text",
        text: 'save it as a document\n\nAvailable runtime upload refs from this conversation. When the user asks to act on the upload, these refs are the source of truth; do not substitute existing entities or retrieved memory with similar titles. For raw file saves/promotions, call system_create with upload: { kind: "web-chat-upload", id: <upload ID> } and the appropriate entityType (PDF -> document, image -> image). If the request names document, PDF, file, image, save, or promote, use raw promotion and omit transform. For markdown/note extraction, call system_create with entityType: "base", upload, and transform: "extract-markdown" only when the request names note, markdown, or text extraction.\n- brief.pdf: upload { kind: "web-chat-upload", id: "upload-00000000-0000-4000-8000-000000000401" }; raw promotion call: system_create({ entityType: "document", upload }) and omit transform',
      },
      {
        type: "file",
        data: new Uint8Array([1, 2, 3]),
        mediaType: "application/pdf",
        filename: "brief.pdf",
      },
    ]);
  });
});
