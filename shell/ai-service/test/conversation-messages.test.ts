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

  it("injects structured agent contact candidates from metadata, not prose", () => {
    const messages = toModelMessages([
      {
        id: "message-1",
        conversationId: "conversation-1",
        role: "assistant",
        content:
          "I can only talk to saved local agents. Add save-it-regression.example first.",
        metadata: JSON.stringify({
          agentContactCandidates: [
            { source: { kind: "url", url: "save-it-regression.example" } },
          ],
        }),
        timestamp: new Date().toISOString(),
      },
    ]);

    const serialized = JSON.stringify(messages);
    expect(serialized).toContain("Internal agent contact candidates");
    expect(serialized).toContain("agent_connect candidate args");
    expect(serialized).toContain("save-it-regression.example");
    expect(serialized).not.toContain("If the prior conversation turn");
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

  const [oldestUploadRef, newestUploadRef] = uploadRefs;
  if (!oldestUploadRef || !newestUploadRef) {
    throw new Error("Expected two upload refs for tests");
  }

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

  it("exposes recent historical upload refs newest-first independent of message wording", () => {
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
      refs: [newestUploadRef, oldestUploadRef],
      attachments: [],
    });
  });

  it("does not narrow candidates for first/latest/filename wording", () => {
    for (const message of [
      "save it",
      "use the oldest upload",
      "describe the most recent file",
      "save file_76007A31-ADF6-408A-93B4-46BCF8860AE1.pdf",
    ]) {
      const result = resolveConversationUploadContinuity({
        message,
        currentAttachments: [],
        historyMessages,
      });

      expect(result.refs).toEqual([newestUploadRef, oldestUploadRef]);
    }
  });

  it("selects the newest matching upload for singular image/pdf references", () => {
    const refs = [
      {
        filename: "drunken-robot.png",
        mediaType: "image/png",
        source: { kind: "upload", id: "upload-old-image" },
      },
      {
        filename: "distributed-systems-primer.pdf",
        mediaType: "application/pdf",
        source: { kind: "upload", id: "upload-pdf" },
      },
      {
        filename: "flirty-robot.png",
        mediaType: "image/png",
        source: { kind: "upload", id: "upload-new-image" },
      },
    ];
    const pdfRef = refs[1];
    const newestImageRef = refs[2];
    if (!pdfRef || !newestImageRef) {
      throw new Error("Expected PDF and newest image refs for test");
    }

    const history = refs.map((ref, index) => ({
      id: `message-upload-${index}`,
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

    expect(
      resolveConversationUploadContinuity({
        message: "Describe the uploaded image.",
        currentAttachments: [],
        historyMessages: history,
      }).refs,
    ).toEqual([newestImageRef]);

    expect(
      resolveConversationUploadContinuity({
        message: "Summarize the uploaded PDF.",
        currentAttachments: [],
        historyMessages: history,
      }).refs,
    ).toEqual([pdfRef]);
  });

  it("caps historical refs by recency without reading message wording", () => {
    const manyRefs = Array.from({ length: 8 }, (_, index) => ({
      filename: `file-${index}.pdf`,
      mediaType: "application/pdf",
      source: { kind: "upload", id: `upload-${index}` },
    }));
    const result = resolveConversationUploadContinuity({
      message: "use the first file",
      currentAttachments: [],
      historyMessages: manyRefs.map((ref, index) => ({
        id: `message-many-${index}`,
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
      })),
    });

    expect(result.refs.map((ref) => ref.source.id)).toEqual([
      "upload-7",
      "upload-6",
      "upload-5",
      "upload-4",
      "upload-3",
      "upload-2",
    ]);
  });

  it("passes current attachment refs plus recent history through as candidate data", () => {
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
      refs: [
        {
          filename: "brief.pdf",
          mediaType: "application/pdf",
          source: { kind: "upload", id: "upload-current" },
        },
        newestUploadRef,
        oldestUploadRef,
      ],
      attachments: [attachment],
    });
  });

  it("exposes the latest non-upload-intent assistant message as a prior-response candidate in upload follow-ups", () => {
    const result = resolveConversationUploadContinuity({
      message: "save it",
      currentAttachments: [],
      historyMessages: [
        {
          id: "message-upload",
          conversationId: "conversation-1",
          role: "user" as const,
          content: "",
          metadata: JSON.stringify({
            attachments: [
              {
                kind: "file",
                filename: "brief.pdf",
                mediaType: "application/pdf",
                source: { kind: "upload", id: "upload-brief" },
              },
            ],
          }),
          timestamp: new Date().toISOString(),
        },
        {
          id: "message-upload-ack",
          conversationId: "conversation-1",
          role: "assistant" as const,
          content: "I got `brief.pdf`. What would you like me to do with it?",
          metadata: JSON.stringify({
            cards: [{ kind: "actions", id: "actions:upload-intent" }],
          }),
          timestamp: new Date().toISOString(),
        },
        {
          id: "message-summary",
          conversationId: "conversation-1",
          role: "assistant" as const,
          content: "The document is about distributed systems.",
          metadata: "{}",
          timestamp: new Date().toISOString(),
        },
      ],
    });

    expect(result.priorResponseRef).toEqual({ messageId: "message-summary" });
  });

  it("does not expose entity-memory assistant turns as prior-response candidates", () => {
    const result = resolveConversationUploadContinuity({
      message: "show my wishlist",
      currentAttachments: [],
      historyMessages: [
        {
          id: "message-completed",
          conversationId: "conversation-1",
          role: "assistant" as const,
          content: 'Completed: Create "Make lasagna"',
          metadata: JSON.stringify({
            entityMemoryRefs: [{ entityId: "make-lasagna" }],
          }),
          timestamp: new Date().toISOString(),
        },
      ],
    });

    expect(result.priorResponseRef).toBeUndefined();
  });
});

describe("buildMessageWithAttachments", () => {
  it("tells the model that upload descriptions and summaries are read-only", () => {
    const content = buildMessageWithAttachments(
      "Summarize the uploaded PDF.",
      undefined,
      {
        uploadRefs: [
          {
            filename: "distributed-systems-primer.pdf",
            mediaType: "application/pdf",
            source: { kind: "upload", id: "upload-pdf" },
          },
        ],
      },
    );

    expect(content).toContain(
      'For phrases like "the uploaded image" or "the uploaded PDF" without a filename, use the newest ref matching that media type',
    );
    expect(content).toContain(
      "Describe, summarize, analyze, or discuss uploads directly from the file bytes as read-only chat responses",
    );
    expect(content).toContain(
      "do not call system_create unless the user explicitly asks to save, import, preserve, or create an entity",
    );
    expect(content).toContain(
      'Use system_create source.kind upload with transform "preserve" for preserving raw file bytes as a document/image, or transform "extract-markdown" for extracting/importing upload text as a note',
    );
  });

  it("includes model-visible prior upload refs without routing prose", () => {
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
    expect(content).toContain("structured candidate data");
    expect(content).not.toContain("use the most recent matching upload ref");
    expect(content).not.toContain("Raw uploaded file path:");
    expect(content).not.toContain("Prior assistant response path:");
    expect(content).toContain(
      '- distributed-systems-primer.pdf; upload: { kind: "upload", id: "upload-00000000-0000-4000-8000-000000000401" }; mediaType: application/pdf',
    );
    expect(content).not.toContain("note-extract args");
  });

  it("includes model-visible prior-response refs as structured candidate data", () => {
    const content = buildMessageWithAttachments("save it", undefined, {
      priorResponseRef: { messageId: "message-summary" },
    });

    expect(content).toContain(
      'Available system_create candidate for saving the prior assistant response (call without confirmed to request confirmation): { entityType: "note", source: { kind: "prior-response", messageId: "message-summary" } }',
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
          '- brief.pdf; upload: { kind: "upload", id: "upload-00000000-0000-4000-8000-000000000401" }; mediaType: application/pdf',
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
    const text = textPart?.type === "text" ? textPart.text : "";
    expect(text).toContain("structured candidate data");
    expect(text).not.toContain("use the most recent matching upload ref");
    expect(text).not.toContain("Raw uploaded file path:");
    expect(text).not.toContain("Prior assistant response path:");
  });
});
