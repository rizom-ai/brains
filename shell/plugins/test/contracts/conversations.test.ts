import { describe, expect, it } from "bun:test";
import {
  ConversationSchema,
  MessageSchema,
} from "../../src/contracts/conversations";
import {
  toPublicConversation,
  toPublicMessage,
} from "../../src/base/public-conversations";

describe("public conversation contracts", () => {
  it("maps internal conversation rows to the stable public contract", () => {
    const publicConversation = toPublicConversation({
      id: "conv-1",
      sessionId: "session-1",
      interfaceType: "discord",
      channelId: "channel-1",
      started: "2026-01-01T00:00:00.000Z",
      lastActive: "2026-01-01T00:01:00.000Z",
      metadata: JSON.stringify({ channelName: "general", extra: true }),
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:01:00.000Z",
    });

    expect(ConversationSchema.parse(publicConversation)).toEqual({
      id: "conv-1",
      sessionId: "session-1",
      interfaceType: "discord",
      channelId: "channel-1",
      channelName: "general",
      startedAt: "2026-01-01T00:00:00.000Z",
      lastActiveAt: "2026-01-01T00:01:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
      metadata: { channelName: "general", extra: true },
    });
  });

  it("keeps invalid or non-object metadata behind an empty public object", () => {
    const publicConversation = toPublicConversation({
      id: "conv-2",
      sessionId: "session-2",
      interfaceType: "cli",
      channelId: "channel-2",
      started: "2026-01-01T00:00:00.000Z",
      lastActive: "2026-01-01T00:01:00.000Z",
      metadata: "not json",
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:01:00.000Z",
    });

    expect(publicConversation.metadata).toEqual({});
    expect(publicConversation.channelName).toBeUndefined();
  });

  it("maps internal messages to the stable public contract", () => {
    const publicMessage = toPublicMessage({
      id: "msg-1",
      conversationId: "conv-1",
      role: "assistant",
      content: "hello",
      timestamp: "2026-01-01T00:01:00.000Z",
      metadata: JSON.stringify({ tool: "search" }),
    });

    expect(MessageSchema.parse(publicMessage)).toEqual({
      id: "msg-1",
      conversationId: "conv-1",
      role: "assistant",
      content: "hello",
      timestamp: "2026-01-01T00:01:00.000Z",
      metadata: { tool: "search" },
    });
  });
});
