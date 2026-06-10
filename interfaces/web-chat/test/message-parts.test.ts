import { describe, expect, it } from "bun:test";
import { groupMessageParts } from "../ui-react/src/message-parts";
import {
  createUploadMessageParts,
  type WebChatUploadResponse,
} from "../ui-react/src/uploads";

function makeUploadResponse(): WebChatUploadResponse {
  return {
    id: "upload-123",
    ref: { kind: "upload", id: "upload-123" },
    filename: "notes.md",
    mediaType: "text/markdown",
    sizeBytes: 12,
    createdAt: "2026-05-30T00:00:00.000Z",
    url: "/api/chat/uploads?id=upload-123",
    downloadUrl: "/api/chat/uploads?id=upload-123&download=1",
  };
}

describe("web chat message part grouping", () => {
  it("renders durable upload refs as uploaded file pills", () => {
    const upload = makeUploadResponse();

    expect(
      groupMessageParts(createUploadMessageParts("Summarize", [upload])),
    ).toEqual([
      { kind: "text", text: "Summarize" },
      {
        kind: "file",
        filename: "notes.md",
        mediaType: "text/markdown",
        url: "/api/chat/uploads?id=upload-123",
        downloadUrl: "/api/chat/uploads?id=upload-123&download=1",
      },
    ]);
  });

  it("ignores malformed durable upload parts instead of rendering raw data", () => {
    expect(
      groupMessageParts([
        {
          type: "data-upload",
          data: { ref: { kind: "upload", id: "upload-123" } },
        },
      ]),
    ).toEqual([]);
  });

  it("groups structured source citation parts semantically", () => {
    const sources = {
      kind: "sources",
      id: "sources:agent-context",
      sources: [
        {
          id: "summary-1",
          source: "conversation-memory",
          title: "Relay decision summary",
        },
      ],
    };

    expect(
      groupMessageParts([
        {
          type: "data-sources",
          data: sources,
        },
      ]),
    ).toEqual([{ kind: "sources", data: sources }]);
  });

  it("groups structured progress parts semantically", () => {
    const progress = {
      status: "processing",
      operationType: "publish",
      operationTarget: "homepage",
      message: "Building site",
    };

    expect(
      groupMessageParts([
        {
          type: "data-progress",
          data: progress,
        },
      ]),
    ).toEqual([{ kind: "progress", data: progress }]);
  });
});
