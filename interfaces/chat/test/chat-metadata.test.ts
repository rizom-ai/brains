import { describe, expect, it } from "bun:test";
import { createExternalActorId } from "@brains/contracts";
import {
  buildChatActionEventMetadata,
  buildChatCoalescedAgentInput,
  buildChatUserMessageMetadata,
  getChatConversationId,
} from "../src/chat-metadata";

const thread = {
  id: "discord:guild-123:channel-123:thread-456",
  channelId: "discord:guild-123:channel-123",
  adapter: { name: "discord" },
  isDM: false,
};

const message = {
  id: "message-1",
  author: {
    userId: "user-1",
    userName: "mira",
    fullName: "Mira Ops",
    isBot: "false",
  },
};

describe("chat metadata", () => {
  it("builds stable conversation and attributed user-message metadata", () => {
    expect(getChatConversationId("discord", thread.id)).toBe(
      `discord-${thread.id}`,
    );
    expect(
      buildChatUserMessageMetadata("discord", thread, message, {
        supersededMessageCount: 1,
      }),
    ).toEqual({
      actor: {
        identity: {
          kind: "external",
          externalActorId: createExternalActorId("discord", "user-1"),
        },
        interfaceType: "discord",
        role: "user",
        displayName: "Mira Ops",
        username: "mira",
        isBot: false,
      },
      source: {
        messageId: "message-1",
        channelId: thread.id,
        channelName: "discord:guild-123:channel-123",
        threadId: "thread-456",
        metadata: {
          supersededMessageCount: 1,
          guildId: "guild-123",
        },
      },
    });
  });

  it("builds action attribution without dropping action metadata", () => {
    const event = {
      actionId: "chat.confirm",
      value: "approval-1",
      messageId: "message-2",
      user: {
        userId: "user-2",
        userName: "sam",
        fullName: "Sam Reviewer",
        isBot: false,
      },
    };

    expect(buildChatActionEventMetadata("discord", thread, event)).toEqual({
      actor: {
        identity: {
          kind: "external",
          externalActorId: createExternalActorId("discord", "user-2"),
        },
        interfaceType: "discord",
        role: "user",
        displayName: "Sam Reviewer",
        username: "sam",
        isBot: false,
      },
      source: {
        messageId: "message-2",
        channelId: thread.id,
        channelName: "discord:guild-123:channel-123",
        threadId: "thread-456",
        metadata: {
          actionId: "chat.confirm",
          actionValue: "approval-1",
          guildId: "guild-123",
        },
      },
    });
  });

  it("coalesces skipped messages and returns their source metadata", () => {
    const context = {
      skipped: [
        {
          id: "message-old",
          text: "save the first version",
          author: { fullName: "Mira", userName: "mira" },
        },
      ],
      totalSinceLastHandler: 2,
    };

    const result = buildChatCoalescedAgentInput(
      "save the newest version",
      context,
    );

    expect(result.message).toContain("- Mira: save the first version");
    expect(result.message).toContain(
      "Latest message to answer:\nsave the newest version",
    );
    expect(result.metadata).toEqual({
      supersededMessageCount: 1,
      supersededMessageIds: ["message-old"],
    });
  });
});
