import { describe, expect, it } from "bun:test";
import { toUiMessage } from "../ui-react/src/history-messages";

const createdAt = "2026-05-24T00:00:30.000Z";

describe("web chat history messages", () => {
  it("rehydrates stored upload refs as AI SDK data-upload parts", () => {
    expect(
      toUiMessage({
        id: "message-1",
        role: "user",
        content: "Summarize this",
        attachments: [
          {
            kind: "text",
            filename: "notes.md",
            mediaType: "text/markdown",
            sizeBytes: 7,
            createdAt,
            source: { kind: "upload", id: "upload-123" },
          },
        ],
      }),
    ).toEqual({
      id: "message-1",
      role: "user",
      parts: [
        { type: "text", text: "Summarize this" },
        {
          type: "data-upload",
          data: {
            id: "upload-123",
            ref: { kind: "upload", id: "upload-123" },
            filename: "notes.md",
            mediaType: "text/markdown",
            sizeBytes: 7,
            createdAt,
            url: "/api/chat/uploads?id=upload-123",
            downloadUrl: "/api/chat/uploads?id=upload-123&download=1",
          },
        },
      ],
    });
  });

  it("strips internal entity memory notes from hydrated assistant text", () => {
    expect(
      toUiMessage({
        id: "message-1",
        role: "assistant",
        content:
          'Queued image generation.\n\n[Entities affected this turn: image "wild-robot" (generating). Reference these IDs directly in follow-ups instead of searching for them.]',
      }),
    ).toEqual({
      id: "message-1",
      role: "assistant",
      parts: [{ type: "text", text: "Queued image generation." }],
    });
  });

  it("rehydrates stored generated artifact cards as AI SDK data-attachment parts", () => {
    const card = {
      kind: "attachment" as const,
      id: "attachment:mossy-robot",
      jobId: "job-1",
      title: "mossy-robot.png",
      description: "image generation has been queued.",
      attachment: {
        mediaType: "image/png",
        url: "/api/chat/attachments/image?id=mossy-robot",
        downloadUrl: "/api/chat/attachments/image?id=mossy-robot&download=1",
        filename: "mossy-robot.png",
        source: {
          entityType: "image",
          entityId: "mossy-robot",
          attachmentType: "generated",
        },
      },
    };

    expect(
      toUiMessage({
        id: "message-1",
        role: "assistant",
        content: "Queued image generation.",
        cards: [card],
      }),
    ).toEqual({
      id: "message-1",
      role: "assistant",
      parts: [
        { type: "text", text: "Queued image generation." },
        { type: "data-attachment", data: card },
      ],
    });
  });

  it("ignores history attachments without durable web-chat upload refs", () => {
    expect(
      toUiMessage({
        id: "message-1",
        role: "user",
        content: "Summarize this",
        attachments: [
          {
            kind: "text",
            filename: "notes.md",
            mediaType: "text/markdown",
            sizeBytes: 7,
            createdAt,
            source: { kind: "other", id: "upload-123" },
          },
        ],
      }),
    ).toEqual({
      id: "message-1",
      role: "user",
      parts: [{ type: "text", text: "Summarize this" }],
    });
  });
});
