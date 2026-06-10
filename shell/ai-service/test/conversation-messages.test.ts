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

    expect(content).toBe(
      'turn it into a note\n\nAvailable upload refs from this conversation. These refs are passive context until the user asks to act on an uploaded file. When the user asks to act on an upload, these refs are the source of truth; do not substitute existing entities or retrieved memory with similar titles. If multiple refs are listed and the user\'s request refers to a single upload with words like "it" or "this", use the most recent matching upload ref. Ask which upload to use only when the user explicitly refers to multiple uploads or the intended upload remains unclear. If the user asks to use another source, such as an existing entity, deck carousel, printable, or source attachment, omit upload and use that source instead. For deck carousel or printable PDF previews, call document_generate when available; for save/attach/regenerate/replace requests, call system_create with sourceAttachment. Do not try to inspect PDF/image bytes before raw file saves; call system_create with the selected upload ref even when the file content is not human-readable in the prompt. For raw file saves/promotions, call system_create with upload: { kind: "upload", id: <upload ID> } and the appropriate entityType (PDF -> document, image -> image). For markdown/note extraction, call system_create with entityType: "base", upload, and transform: "extract-markdown" only when the user asks to extract/import/turn uploaded content into note, markdown, or text.\n- distributed-systems-primer.pdf: upload { kind: "upload", id: "upload-00000000-0000-4000-8000-000000000401" }; mediaType: application/pdf',
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
        text: 'save it as a document\n\nAvailable upload refs from this conversation. These refs are passive context until the user asks to act on an uploaded file. When the user asks to act on an upload, these refs are the source of truth; do not substitute existing entities or retrieved memory with similar titles. If multiple refs are listed and the user\'s request refers to a single upload with words like "it" or "this", use the most recent matching upload ref. Ask which upload to use only when the user explicitly refers to multiple uploads or the intended upload remains unclear. If the user asks to use another source, such as an existing entity, deck carousel, printable, or source attachment, omit upload and use that source instead. For deck carousel or printable PDF previews, call document_generate when available; for save/attach/regenerate/replace requests, call system_create with sourceAttachment. Do not try to inspect PDF/image bytes before raw file saves; call system_create with the selected upload ref even when the file content is not human-readable in the prompt. For raw file saves/promotions, call system_create with upload: { kind: "upload", id: <upload ID> } and the appropriate entityType (PDF -> document, image -> image). For markdown/note extraction, call system_create with entityType: "base", upload, and transform: "extract-markdown" only when the user asks to extract/import/turn uploaded content into note, markdown, or text.\n- brief.pdf: upload { kind: "upload", id: "upload-00000000-0000-4000-8000-000000000401" }; mediaType: application/pdf',
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
