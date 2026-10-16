import { describe, expect, it } from "bun:test";
import {
  actionItemMetadataSchema,
  actionItemOrigin,
  actionItemSchema,
} from "../../src/schemas/conversation-memory";

const conversation = {
  conversationId: "conv-1",
  channelId: "events",
  interfaceType: "discord",
  spaceId: "discord:events",
  timeRange: {
    start: "2026-10-10T10:00:00.000Z",
    end: "2026-10-10T10:20:00.000Z",
  },
  sourceSummaryId: "conv-1",
  sourceMessageCount: 3,
  projectionVersion: 1,
  status: "open",
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

describe("action-item origin", () => {
  it("reads stored items without an origin as captured from a conversation", () => {
    const metadata = actionItemMetadataSchema.parse(conversation);
    expect(actionItemOrigin(metadata)).toEqual({
      kind: "conversation",
      conversationId: "conv-1",
      channelId: "events",
      interfaceType: "discord",
      spaceId: "discord:events",
      sourceSummaryId: "conv-1",
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
    expect(
      actionItemSchema.safeParse({
        id: "inbox:req-1",
        entityType: "action-item",
        content: "# Action item: Reply\n\nReply.\n",
        contentHash: "x",
        visibility: "shared",
        created: "2026-10-15T10:12:00.000Z",
        updated: "2026-10-15T10:12:00.000Z",
        metadata: fromInbox,
      }).success,
    ).toBe(true);
  });

  it("refuses an Inbox item without its source, and a conversation item without its conversation", () => {
    const { sourceRef: _sourceRef, ...unsourced } = fromInbox;
    expect(actionItemMetadataSchema.safeParse(unsourced).success).toBe(false);
    const { conversationId: _conversationId, ...unanchored } = conversation;
    expect(actionItemMetadataSchema.safeParse(unanchored).success).toBe(false);
  });
});
