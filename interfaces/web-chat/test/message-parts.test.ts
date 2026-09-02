import { describe, expect, it } from "bun:test";
import {
  groupMessagePartSections,
  groupMessageParts,
} from "../ui-react/src/message-parts";
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

  it("groups structured action parts semantically", () => {
    const actions = {
      kind: "actions",
      id: "actions:onboarding",
      actions: [
        {
          type: "prompt",
          id: "review-draft",
          label: "Review draft",
          prompt: "Show me the transformed draft.",
        },
      ],
    };

    expect(
      groupMessageParts([
        {
          type: "data-actions",
          data: actions,
        },
      ]),
    ).toEqual([{ kind: "actions", data: actions }]);
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

  it("separates message parts into body, sources, actions, and details sections", () => {
    const actions = {
      kind: "actions",
      id: "actions:onboarding",
      actions: [
        {
          type: "prompt",
          id: "review-draft",
          label: "Review draft",
          prompt: "Show me the transformed draft.",
        },
      ],
    };
    const sources = {
      kind: "sources",
      id: "sources:tool-results",
      sources: [{ id: "post-1", source: "post" }],
    };
    const toolResult = { toolName: "system_search" };

    expect(
      groupMessagePartSections([
        { type: "text", text: "Here is the answer." },
        { type: "data-tool-result", data: toolResult },
        { type: "data-actions", data: actions },
        { type: "data-sources", data: sources },
      ]),
    ).toEqual({
      body: [{ kind: "text", text: "Here is the answer." }],
      sources: [{ kind: "sources", data: sources }],
      actions: [{ kind: "actions", data: actions }],
      details: [{ kind: "tools", tools: [toolResult] }],
    });
  });

  it("keeps resolved approval tool output visible in the message body", () => {
    const resolvedApprovalPart = {
      type: "dynamic-tool" as const,
      toolCallId: "call-1",
      toolName: "system_update",
      state: "output-available" as const,
      title: 'Update "Big people are small too"?',
      input: { entityType: "base", id: "big-people-are-small-too" },
      output: { success: true, data: { updated: "big-people-are-small-too" } },
    };

    expect(groupMessagePartSections([resolvedApprovalPart])).toEqual({
      body: [{ kind: "native-tool", data: resolvedApprovalPart }],
      sources: [],
      actions: [],
      details: [],
    });
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
