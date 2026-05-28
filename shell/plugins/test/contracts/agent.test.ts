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
      cards: [
        {
          kind: "tool-approval",
          id: "approval:call-1",
          toolCallId: "call-1",
          toolName: "delete",
          input: { id: "item-1" },
          summary: "Delete item",
          state: "approval-requested",
        },
      ],
      pendingConfirmation: {
        id: "approval:call-1",
        toolCallId: "call-1",
        toolName: "delete",
        summary: "Delete item",
        args: { id: "item-1" },
      },
      pendingConfirmations: [
        {
          id: "approval:call-1",
          toolCallId: "call-1",
          toolName: "delete",
          summary: "Delete item",
          args: { id: "item-1" },
        },
      ],
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
      cards: [
        {
          kind: "tool-approval",
          id: "approval:call-1",
          toolCallId: "call-1",
          toolName: "delete",
          input: { id: "item-1" },
          summary: "Delete item",
          state: "approval-requested",
        },
      ],
      pendingConfirmation: {
        id: "approval:call-1",
        toolCallId: "call-1",
        toolName: "delete",
        summary: "Delete item",
        args: { id: "item-1" },
      },
      pendingConfirmations: [
        {
          id: "approval:call-1",
          toolCallId: "call-1",
          toolName: "delete",
          summary: "Delete item",
          args: { id: "item-1" },
        },
      ],
      usage: {
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
      },
    });
  });

  it("keeps singular pendingConfirmation as compatibility-only first pending approval", () => {
    const response = toPublicAgentResponse({
      text: "Confirmation required.",
      pendingConfirmations: [
        {
          id: "approval:first",
          toolName: "delete",
          summary: "Delete first item",
          args: { id: "first" },
        },
        {
          id: "approval:second",
          toolName: "delete",
          summary: "Delete second item",
          args: { id: "second" },
        },
      ],
      usage: {
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
      },
    });

    expect(response.pendingConfirmation).toEqual({
      id: "approval:first",
      toolName: "delete",
      summary: "Delete first item",
      args: { id: "first" },
    });
    expect(
      response.pendingConfirmations?.map((confirmation) => confirmation.id),
    ).toEqual(["approval:first", "approval:second"]);
  });
});
