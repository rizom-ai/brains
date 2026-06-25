import { describe, expect, it } from "bun:test";
import {
  buildMessageWithAttachments,
  collectUploadRefsFromMessages,
  resolveConversationUploadContinuity,
  toModelMessages,
} from "../src/conversation-messages";

describe("toModelMessages", () => {
  it("does not stamp assistant-content referents onto assistant message text", () => {
    const messages = toModelMessages([
      {
        id: "message-1",
        conversationId: "conversation-1",
        role: "assistant",
        content: "Completed: Updated anchor profile.",
        metadata: JSON.stringify({
          entityMemoryNote:
            '\n\n[Entities affected this turn: anchor-profile "anchor-profile" (updated). Reference these IDs directly in follow-ups instead of searching for them.]',
        }),
        timestamp: new Date().toISOString(),
      },
    ]);

    expect(JSON.stringify(messages)).not.toContain(
      "Internal conversation content ref",
    );
    expect(JSON.stringify(messages)).not.toContain('entityType \\"note\\"');
    expect(JSON.stringify(messages)).not.toContain(
      "Entities affected this turn",
    );
    expect(JSON.stringify(messages)).not.toContain(
      "Reference these IDs directly",
    );
  });

  it("does not add assistant-content refs to upload intent acknowledgements", () => {
    const messages = toModelMessages([
      {
        id: "message-1",
        conversationId: "conversation-1",
        role: "assistant",
        content: "I got `brief.pdf`. What would you like me to do with it?",
        metadata: JSON.stringify({
          cards: [{ kind: "actions", id: "actions:upload-intent" }],
        }),
        timestamp: new Date().toISOString(),
      },
    ]);

    expect(JSON.stringify(messages)).not.toContain(
      "Internal conversation content ref",
    );
  });
});

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

  it("does not expose stale prior uploads without a structural upload handoff", () => {
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
      refs: [],
      attachments: [],
    });
  });

  it("exposes prior upload refs immediately after the upload-intent card", () => {
    const firstHistoryMessage = historyMessages[0];
    const firstUploadRef = uploadRefs[0];
    if (firstHistoryMessage === undefined || firstUploadRef === undefined) {
      throw new Error("Expected upload fixture");
    }

    const result = resolveConversationUploadContinuity({
      message: "Summarize the uploaded PDF.",
      currentAttachments: [],
      historyMessages: [
        firstHistoryMessage,
        {
          id: "message-upload-intent",
          conversationId: "conversation-1",
          role: "assistant",
          content:
            "I got `file_76007A31-ADF6-408A-93B4-46BCF8860AE1.pdf`. What would you like me to do with it?",
          metadata: JSON.stringify({
            cards: [
              {
                kind: "actions",
                id: "actions:upload-intent",
                title: "Try next",
                actions: [],
              },
            ],
          }),
          timestamp: new Date().toISOString(),
        },
      ],
    });

    expect(result).toEqual({
      kind: "selected",
      message: "Summarize the uploaded PDF.",
      refs: [firstUploadRef],
      attachments: [],
    });
  });

  it("exposes prior upload refs when the last stored turn is an unanswered upload message", () => {
    const firstHistoryMessage = historyMessages[0];
    const firstUploadRef = uploadRefs[0];
    if (firstHistoryMessage === undefined || firstUploadRef === undefined) {
      throw new Error("Expected upload fixture");
    }

    const result = resolveConversationUploadContinuity({
      message: "try again",
      currentAttachments: [],
      historyMessages: [
        {
          ...firstHistoryMessage,
          content: "Summarize this upload",
        },
      ],
    });

    expect(result).toEqual({
      kind: "selected",
      message: "try again",
      refs: [firstUploadRef],
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
      refs: [],
      attachments: [],
    });
  });

  it("narrows singular raw-save follow-ups to the latest pending upload ref", () => {
    const latestUploadRef = uploadRefs.at(-1);
    if (!latestUploadRef) throw new Error("expected upload fixture");

    const result = resolveConversationUploadContinuity({
      message: "save it",
      currentAttachments: [],
      historyMessages: [
        {
          id: "message-pending-uploads",
          conversationId: "conversation-1",
          role: "user",
          content: "I uploaded these files",
          metadata: JSON.stringify({
            attachments: uploadRefs.map((ref) => ({
              kind: "file",
              filename: ref.filename,
              mediaType: ref.mediaType,
              source: ref.source,
            })),
          }),
          timestamp: new Date().toISOString(),
        },
      ],
    });

    expect(result).toEqual({
      kind: "selected",
      message: "save it",
      refs: [latestUploadRef],
      attachments: [],
    });
  });

  it("does not resurrect historical uploads for summary save-it follow-ups", () => {
    const result = resolveConversationUploadContinuity({
      message: "can you save it",
      currentAttachments: [],
      historyMessages: [
        ...historyMessages,
        {
          id: "message-summary",
          conversationId: "conversation-1",
          role: "assistant",
          content: "The PDF summarizes consensus protocols.",
          metadata: null,
          timestamp: new Date().toISOString(),
        },
      ],
    });

    expect(result).toEqual({
      kind: "selected",
      message: "can you save it",
      refs: [],
      attachments: [],
    });
  });

  it("keeps all pending refs when the user names a filename", () => {
    const result = resolveConversationUploadContinuity({
      message: "save file_76007A31-ADF6-408A-93B4-46BCF8860AE1.pdf",
      currentAttachments: [],
      historyMessages: [
        {
          id: "message-pending-uploads",
          conversationId: "conversation-1",
          role: "user",
          content: "I uploaded these files",
          metadata: JSON.stringify({
            attachments: uploadRefs.map((ref) => ({
              kind: "file",
              filename: ref.filename,
              mediaType: ref.mediaType,
              source: ref.source,
            })),
          }),
          timestamp: new Date().toISOString(),
        },
      ],
    });

    expect(result).toEqual({
      kind: "selected",
      message: "save file_76007A31-ADF6-408A-93B4-46BCF8860AE1.pdf",
      refs: uploadRefs,
      attachments: [],
    });
  });

  it("keeps all historical refs when the user names a filename", () => {
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
      refs: [],
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
      "use the most recent matching upload ref only when they explicitly ask to save, import, promote, attach, extract, or otherwise act on the uploaded file itself",
    );
    expect(content).toContain("Raw uploaded file path:");
    expect(content).toContain("call system_upload_save");
    expect(content).toContain("Prior assistant response path:");
    expect(content).toContain('source: { kind: "prior-response" }');
    expect(content).not.toContain("content from the conversation");
    expect(content).toContain(
      "For summarize/describe/read/inspect/analyze requests, answer in chat from the attachment and do not call system_create",
    );
    expect(content).toContain(
      '- distributed-systems-primer.pdf: upload.kind="upload"; upload.id="upload-00000000-0000-4000-8000-000000000401"; mediaType: application/pdf; raw-save entityType="document"; note-extract args: entityType="note", source.kind="upload", source.upload.kind="upload", source.upload.id="upload-00000000-0000-4000-8000-000000000401", source.transform="extract-markdown"',
    );
    expect(content).toContain(
      "This is the only valid durable note-import operation for this upload; do not copy attachment bytes into a text source for note import.",
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
          '- brief.pdf: upload.kind="upload"; upload.id="upload-00000000-0000-4000-8000-000000000401"; mediaType: application/pdf; raw-save entityType="document"',
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
      "use the most recent matching upload ref only when they explicitly ask to save, import, promote, attach, extract, or otherwise act on the uploaded file itself",
    );
    const text = textPart?.type === "text" ? textPart.text : "";
    expect(text).toContain("Raw uploaded file path:");
    expect(text).toContain("Prior assistant response path:");
    expect(text).toContain('source: { kind: "prior-response" }');
    expect(text).not.toContain("content from the conversation");
    expect(text).toContain(
      "For summarize/describe/read/inspect/analyze requests, answer in chat from the attachment and do not call system_create",
    );
  });
});
