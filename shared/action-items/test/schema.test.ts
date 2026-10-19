import { describe, expect, it } from "bun:test";
import {
  actionItemMetadataSchema,
  actionItemOrigin,
  actionItemSchema,
} from "../src";

const conversation = {
  conversationId: "conv-1",
  interfaceType: "discord",
  channelId: "events",
  channelName: "events",
  capturedAt: "2026-10-10T10:20:00.000Z",
  status: "open",
  assignedTo: [{ name: "Sam Rivera", id: "user:u-sam" }],
  requestedBy: [{ name: "Niels Ward", id: "user:u-niels" }],
};

const fromInbox = {
  origin: "inbox",
  sourceRef: {
    sourceId: "contact-requests",
    entityType: "contact-request",
    entityId: "req-1",
  },
  capturedAt: "2026-10-15T10:12:00.000Z",
  status: "open",
};

function entity(metadata: unknown): unknown {
  return {
    id: "item-1",
    entityType: "action-item",
    content: "# Action item: Reply\n\nReply.\n",
    contentHash: "x",
    visibility: "shared",
    created: "2026-10-15T10:12:00.000Z",
    updated: "2026-10-15T10:12:00.000Z",
    metadata,
  };
}

describe("action-item origin", () => {
  it("reads a conversation item by its conversation and channel", () => {
    const metadata = actionItemMetadataSchema.parse(conversation);
    expect(actionItemOrigin(metadata)).toEqual({
      kind: "conversation",
      conversationId: "conv-1",
      interfaceType: "discord",
      channelId: "events",
      channelName: "events",
      capturedAt: "2026-10-10T10:20:00.000Z",
    });
  });

  it("accepts an item tracked from the Inbox, pointing at its source", () => {
    const metadata = actionItemMetadataSchema.parse(fromInbox);
    expect(actionItemOrigin(metadata)).toEqual({
      kind: "inbox",
      sourceRef: fromInbox.sourceRef,
      capturedAt: "2026-10-15T10:12:00.000Z",
    });
    expect(actionItemSchema.safeParse(entity(fromInbox)).success).toBe(true);
  });

  it("refuses an Inbox item without its source, and a conversation item without its conversation or capture time", () => {
    const { sourceRef: _sourceRef, ...unsourced } = fromInbox;
    expect(actionItemMetadataSchema.safeParse(unsourced).success).toBe(false);
    const { conversationId: _conversationId, ...unanchored } = conversation;
    expect(actionItemMetadataSchema.safeParse(unanchored).success).toBe(false);
    const { capturedAt: _capturedAt, ...undated } = conversation;
    expect(actionItemMetadataSchema.safeParse(undated).success).toBe(false);
  });

  it("names a person by name and, when known, by their actor id", () => {
    expect(
      actionItemMetadataSchema.safeParse({
        ...conversation,
        assignedTo: [{ name: "Alex Morgan" }],
      }).success,
    ).toBe(true);
    expect(
      actionItemMetadataSchema.safeParse({
        ...conversation,
        assignedTo: [{ name: "Sam Rivera", id: "u-sam" }],
      }).success,
    ).toBe(false);
  });
});

describe("items stored before the trim", () => {
  const stored = {
    conversationId: "conv-1",
    channelId: "events",
    channelName: "events",
    interfaceType: "discord",
    spaceId: "discord:events",
    timeRange: {
      start: "2026-10-10T10:00:00.000Z",
      end: "2026-10-10T10:20:00.000Z",
    },
    sourceSummaryId: "conv-1",
    sourceMessageCount: 3,
    projectionVersion: 1,
    status: "doing",
    assignedTo: [
      {
        identity: { kind: "user", userId: "u-sam" },
        identityAliases: [{ kind: "user", userId: "u-sam-old" }],
        displayName: "Sam Rivera",
      },
      { displayName: "Alex Morgan" },
    ],
    requestedBy: [
      { identity: { kind: "user", userId: "u-niels" }, displayName: "Niels" },
    ],
  };

  it("read in the trimmed shape: capture time from the conversation, flat people, no leftovers", () => {
    expect(actionItemSchema.parse(entity(stored)).metadata).toEqual({
      conversationId: "conv-1",
      channelId: "events",
      channelName: "events",
      interfaceType: "discord",
      capturedAt: "2026-10-10T10:20:00.000Z",
      status: "doing",
      assignedTo: [
        { name: "Sam Rivera", id: "user:u-sam", aliases: ["user:u-sam-old"] },
        { name: "Alex Morgan" },
      ],
      requestedBy: [{ name: "Niels", id: "user:u-niels" }],
    });
  });

  it("read legacy actor ids as actor ids", () => {
    const metadata = actionItemSchema.parse(
      entity({
        ...stored,
        assignedTo: [{ actorId: "discord:user-sam", displayName: "Sam" }],
      }),
    ).metadata;
    expect(metadata.assignedTo?.[0]?.name).toBe("Sam");
    expect(metadata.assignedTo?.[0]?.id).toMatch(/^external:ext_/);
  });
});
