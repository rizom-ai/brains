import { describe, expect, it } from "bun:test";
import {
  buildMessageWithAttachments,
  collectUploadRefsFromMessages,
  resolveConversationUploadContinuity,
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

describe("resolveConversationUploadContinuity", () => {
  const uploadRefs = [
    {
      filename: "first-robot.png",
      mediaType: "image/png",
      source: {
        kind: "web-chat-upload",
        id: "upload-first",
      },
    },
    {
      filename: "second-robot.png",
      mediaType: "image/png",
      source: {
        kind: "web-chat-upload",
        id: "upload-second",
      },
    },
  ];

  const secondUploadRef = uploadRefs[1];
  if (!secondUploadRef) throw new Error("Expected second upload fixture");

  const historyMessages = uploadRefs.map((ref, index) => ({
    id: `message-${index}`,
    conversationId: "conversation-1",
    role: "user" as const,
    content: "",
    metadata: JSON.stringify({
      attachments: [
        {
          kind: "file",
          filename: ref.filename,
          mediaType: ref.mediaType,
          source: ref.source,
        },
      ],
    }),
    timestamp: new Date().toISOString(),
  }));

  it("resolves selected prior upload refs into native attachments in the shared layer", async () => {
    const result = await resolveConversationUploadContinuity({
      message: "describe the latest image",
      currentAttachments: [],
      historyMessages,
      uploadAttachmentResolver: async (source) => ({
        kind: "file",
        filename:
          source.id === "upload-second"
            ? "second-robot.png"
            : "first-robot.png",
        mediaType: "image/png",
        data: new Uint8Array([1, 2, 3]),
        sizeBytes: 3,
        source,
      }),
    });

    expect(result).toEqual({
      kind: "selected",
      message: "describe the latest image",
      refs: [secondUploadRef],
      attachments: [
        {
          kind: "file",
          filename: "second-robot.png",
          mediaType: "image/png",
          data: new Uint8Array([1, 2, 3]),
          sizeBytes: 3,
          source: { kind: "web-chat-upload", id: "upload-second" },
        },
      ],
    });
  });

  it("carries the original intent through an upload clarification answer", async () => {
    const result = await resolveConversationUploadContinuity({
      message: "the latest one",
      currentAttachments: [],
      historyMessages: [
        ...historyMessages,
        {
          id: "message-request",
          conversationId: "conversation-1",
          role: "user",
          content: "save it as an image",
          metadata: null,
          timestamp: new Date().toISOString(),
        },
        {
          id: "message-clarify",
          conversationId: "conversation-1",
          role: "assistant",
          content:
            "Which uploaded file should I use? `first-robot.png`, `second-robot.png`",
          metadata: null,
          timestamp: new Date().toISOString(),
        },
      ],
      uploadAttachmentResolver: async () => null,
    });

    expect(result).toEqual({
      kind: "selected",
      message: "save it as an image",
      refs: [secondUploadRef],
      attachments: [],
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
