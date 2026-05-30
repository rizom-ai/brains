import { describe, expect, it } from "bun:test";
import { groupMessageParts } from "../ui-react/src/message-parts";
import {
  createUploadMessageParts,
  type WebChatUploadResponse,
} from "../ui-react/src/uploads";

function makeUploadResponse(): WebChatUploadResponse {
  return {
    id: "upload-123",
    ref: { kind: "web-chat-upload", id: "upload-123" },
    filename: "notes.md",
    mediaType: "text/markdown",
    sizeBytes: 12,
    createdAt: "2026-05-30T00:00:00.000Z",
  };
}

describe("web chat message part grouping", () => {
  it("renders durable upload refs as uploaded file pills", () => {
    const upload = makeUploadResponse();

    expect(
      groupMessageParts(createUploadMessageParts("Summarize", [upload])),
    ).toEqual([
      { kind: "text", text: "Summarize" },
      { kind: "file", filename: "notes.md", mediaType: "text/markdown" },
    ]);
  });

  it("ignores malformed durable upload parts instead of rendering raw data", () => {
    expect(
      groupMessageParts([
        {
          type: "data-upload",
          data: { ref: { kind: "web-chat-upload", id: "upload-123" } },
        },
      ]),
    ).toEqual([]);
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
