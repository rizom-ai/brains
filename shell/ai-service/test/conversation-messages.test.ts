import { describe, expect, it } from "bun:test";
import {
  buildMessageWithAttachments,
  collectUploadRefsFromMessages,
  resolveConversationUploadContinuity,
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
                kind: "upload",
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
          kind: "upload",
          id: "upload-00000000-0000-4000-8000-000000000401",
        },
      },
    ]);
  });
});

describe("resolveConversationUploadContinuity", () => {
  const uploadRefs = [
    {
      filename: "file_76007A31-ADF6-408A-93B4-46BCF8860AE1.pdf",
      mediaType: "application/pdf",
      source: {
        kind: "upload",
        id: "upload-pdf",
      },
    },
    {
      filename: "IMG_8963.jpeg",
      mediaType: "image/jpeg",
      source: {
        kind: "upload",
        id: "upload-image",
      },
    },
  ];

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

  it("keeps prior uploads as passive refs instead of asking service-level clarification", () => {
    const result = resolveConversationUploadContinuity({
      message:
        "Can you generate a preview of the innovation deck carousel for me?",
      currentAttachments: [],
      historyMessages,
    });

    expect(result).toEqual({
      kind: "selected",
      message:
        "Can you generate a preview of the innovation deck carousel for me?",
      refs: uploadRefs,
      attachments: [],
    });
  });

  it("does not rewrite clarification replies or select files from text", () => {
    const result = resolveConversationUploadContinuity({
      message: "neither, generate it from the deck",
      currentAttachments: [],
      historyMessages: [
        ...historyMessages,
        {
          id: "message-request",
          conversationId: "conversation-1",
          role: "user",
          content:
            "Can you generate a preview of the innovation deck carousel for me?",
          metadata: null,
          timestamp: new Date().toISOString(),
        },
        {
          id: "message-clarify",
          conversationId: "conversation-1",
          role: "assistant",
          content:
            "Which uploaded file should I use? `file_76007A31-ADF6-408A-93B4-46BCF8860AE1.pdf`, `IMG_8963.jpeg`",
          metadata: null,
          timestamp: new Date().toISOString(),
        },
      ],
    });

    expect(result).toEqual({
      kind: "selected",
      message: "neither, generate it from the deck",
      refs: uploadRefs,
      attachments: [],
    });
  });

  it("narrows singular raw-save follow-ups to the latest prior upload ref", () => {
    const latestUploadRef = uploadRefs.at(-1);
    if (!latestUploadRef) throw new Error("expected upload fixture");

    const result = resolveConversationUploadContinuity({
      message: "save it",
      currentAttachments: [],
      historyMessages,
    });

    expect(result).toEqual({
      kind: "selected",
      message: "save it",
      refs: [latestUploadRef],
      attachments: [],
    });
  });

  it("keeps all refs when the user names a filename", () => {
    const result = resolveConversationUploadContinuity({
      message: "save file_76007A31-ADF6-408A-93B4-46BCF8860AE1.pdf",
      currentAttachments: [],
      historyMessages,
    });

    expect(result).toEqual({
      kind: "selected",
      message: "save file_76007A31-ADF6-408A-93B4-46BCF8860AE1.pdf",
      refs: uploadRefs,
      attachments: [],
    });
  });

  it("passes current attachments through without deriving conversation control flow", () => {
    const attachment = {
      kind: "file" as const,
      filename: "brief.pdf",
      mediaType: "application/pdf",
      data: new Uint8Array([1, 2, 3]),
      sizeBytes: 3,
      source: {
        kind: "upload",
        id: "upload-current",
      },
    };

    const result = resolveConversationUploadContinuity({
      message: "summarize this",
      currentAttachments: [attachment],
      historyMessages,
    });

    expect(result).toEqual({
      kind: "selected",
      message: "summarize this",
      refs: uploadRefs,
      attachments: [attachment],
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
              kind: "upload",
              id: "upload-00000000-0000-4000-8000-000000000401",
            },
          },
        ],
      },
    );

    expect(content).toContain("turn it into a note\n\nAvailable upload refs");
    expect(content).toContain(
      "For summarize/describe/read/inspect/analyze requests, answer in chat from the attachment and do not call system_create",
    );
    expect(content).toContain(
      '- distributed-systems-primer.pdf: upload { kind: "upload", id: "upload-00000000-0000-4000-8000-000000000401" }; mediaType: application/pdf; raw-save entityType: "document"',
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
          kind: "upload",
          id: "upload-00000000-0000-4000-8000-000000000401",
        },
      },
    ]);

    expect(content).toEqual([
      {
        type: "text",
        text: expect.stringContaining(
          '- brief.pdf: upload { kind: "upload", id: "upload-00000000-0000-4000-8000-000000000401" }; mediaType: application/pdf; raw-save entityType: "document"',
        ),
      },
      {
        type: "file",
        data: new Uint8Array([1, 2, 3]),
        mediaType: "application/pdf",
        filename: "brief.pdf",
      },
    ]);
    const textPart = Array.isArray(content) ? content[0] : undefined;
    expect(textPart?.type === "text" ? textPart.text : "").toContain(
      "For summarize/describe/read/inspect/analyze requests, answer in chat from the attachment and do not call system_create",
    );
  });
});
