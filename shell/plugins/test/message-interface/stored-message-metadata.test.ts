import { describe, expect, it } from "bun:test";
import {
  collectPendingApprovalIdsFromStoredMessages,
  collectUploadIdsFromStoredMessages,
  getStoredAttachmentCards,
  getStoredMessageAttachments,
  parseStoredMessageMetadata,
} from "../../src/message-interface/stored-message-metadata";

describe("parseStoredMessageMetadata", () => {
  it("parses object and JSON-string metadata", () => {
    expect(parseStoredMessageMetadata({ ok: true })).toEqual({ ok: true });
    expect(parseStoredMessageMetadata('{"ok":true}')).toEqual({ ok: true });
  });

  it("returns null for invalid or non-object metadata", () => {
    expect(parseStoredMessageMetadata("not json")).toBeNull();
    expect(parseStoredMessageMetadata("[]")).toBeNull();
    expect(parseStoredMessageMetadata(null)).toBeNull();
  });
});

describe("getStoredMessageAttachments", () => {
  it("returns durable attachment metadata without file contents", () => {
    expect(
      getStoredMessageAttachments({
        attachments: [
          {
            kind: "file",
            filename: "diagram.png",
            mediaType: "image/png",
            sizeBytes: 42,
            source: { kind: "web-chat-upload", id: "upload-1" },
          },
        ],
      }),
    ).toEqual([
      {
        kind: "file",
        filename: "diagram.png",
        mediaType: "image/png",
        sizeBytes: 42,
        source: { kind: "web-chat-upload", id: "upload-1" },
      },
    ]);
  });

  it("drops malformed attachments", () => {
    expect(
      getStoredMessageAttachments({
        attachments: [{ kind: "text", filename: "missing-media-type" }],
      }),
    ).toEqual([]);
  });
});

describe("getStoredAttachmentCards", () => {
  it("returns only generated attachment cards", () => {
    const attachmentCard = {
      kind: "attachment" as const,
      id: "attachment:report-1",
      title: "Report",
      attachment: {
        mediaType: "application/pdf",
        url: "/api/report.pdf",
      },
    };

    expect(
      getStoredAttachmentCards({
        cards: [
          attachmentCard,
          {
            kind: "tool-approval",
            id: "approval-1",
            toolName: "system_publish",
            summary: "Publish",
            state: "approval-requested",
          },
        ],
      }),
    ).toEqual([attachmentCard]);
  });
});

describe("collectUploadIdsFromStoredMessages", () => {
  it("collects unique upload ids by source kind and role", () => {
    const messages = [
      {
        role: "user",
        metadata: JSON.stringify({
          attachments: [
            {
              kind: "text",
              filename: "notes.md",
              mediaType: "text/markdown",
              source: { kind: "discord-chat-upload", id: "upload-1" },
            },
            {
              kind: "file",
              filename: "diagram.png",
              mediaType: "image/png",
              source: { kind: "other", id: "ignored" },
            },
          ],
        }),
      },
      {
        role: "assistant",
        metadata: {
          attachments: [
            {
              kind: "text",
              filename: "assistant.md",
              mediaType: "text/markdown",
              source: { kind: "discord-chat-upload", id: "ignored-role" },
            },
          ],
        },
      },
      {
        role: "user",
        metadata: {
          attachments: [
            {
              kind: "text",
              filename: "notes-again.md",
              mediaType: "text/markdown",
              source: { kind: "discord-chat-upload", id: "upload-1" },
            },
          ],
        },
      },
    ];

    expect(
      collectUploadIdsFromStoredMessages(messages, {
        sourceKind: "discord-chat-upload",
        role: "user",
      }),
    ).toEqual(["upload-1"]);
  });
});

describe("collectPendingApprovalIdsFromStoredMessages", () => {
  it("tracks requested approvals and removes resolved approvals", () => {
    const messages = [
      {
        metadata: {
          cards: [
            {
              kind: "tool-approval",
              id: "approval-1",
              toolName: "system_publish",
              summary: "Publish one",
              state: "approval-requested",
            },
            {
              kind: "tool-approval",
              id: "approval-2",
              toolName: "system_publish",
              summary: "Publish two",
              state: "approval-requested",
            },
          ],
        },
      },
      {
        metadata: {
          cards: [
            {
              kind: "tool-approval",
              id: "approval-1",
              toolName: "system_publish",
              summary: "Publish one",
              state: "output-available",
            },
          ],
        },
      },
    ];

    expect([...collectPendingApprovalIdsFromStoredMessages(messages)]).toEqual([
      "approval-2",
    ]);
  });
});
