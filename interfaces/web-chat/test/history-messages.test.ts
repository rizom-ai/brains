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
            source: { kind: "web-chat-upload", id: "upload-123" },
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
            ref: { kind: "web-chat-upload", id: "upload-123" },
            filename: "notes.md",
            mediaType: "text/markdown",
            sizeBytes: 7,
            createdAt,
          },
        },
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
