import { describe, expect, it } from "bun:test";
import {
  AgentResponseSchema,
  ChatContextSchema,
} from "../../src/contracts/agent";
import { toPublicAgentResponse } from "../../src/base/public-agent-service";

describe("public agent contracts", () => {
  it("accepts speaker attribution in chat context", () => {
    expect(
      ChatContextSchema.parse({
        interfaceType: "discord",
        channelId: "thread-456",
        actor: {
          actorId: "discord:user-789",
          interfaceType: "discord",
          role: "user",
          displayName: "Mira Ops",
        },
        source: {
          messageId: "message-123",
          channelId: "channel-123",
          threadId: "thread-456",
          metadata: { guildId: "guild-123" },
        },
      }),
    ).toEqual({
      interfaceType: "discord",
      channelId: "thread-456",
      actor: {
        actorId: "discord:user-789",
        interfaceType: "discord",
        role: "user",
        displayName: "Mira Ops",
      },
      source: {
        messageId: "message-123",
        channelId: "channel-123",
        threadId: "thread-456",
        metadata: { guildId: "guild-123" },
      },
    });
  });

  it("maps runtime agent responses to the stable public contract", () => {
    const response = toPublicAgentResponse({
      text: "Done",
      toolResults: [
        {
          toolName: "search",
          args: { query: "rizom" },
          jobId: "job-1",
          data: { count: 2 },
        },
      ],
      pendingConfirmation: {
        toolName: "delete",
        description: "Delete item",
        args: { id: "item-1" },
      },
      usage: {
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
      },
    });

    expect(AgentResponseSchema.parse(response)).toEqual({
      text: "Done",
      toolResults: [
        {
          toolName: "search",
          args: { query: "rizom" },
          jobId: "job-1",
          data: { count: 2 },
        },
      ],
      pendingConfirmation: {
        toolName: "delete",
        description: "Delete item",
        args: { id: "item-1" },
      },
      usage: {
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
      },
    });
  });
});
