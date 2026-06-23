import { describe, expect, it } from "bun:test";
import {
  buildMessageActorMetadata,
  buildMessageSourceMetadata,
} from "../../src/message-interface/message-attribution";

describe("message attribution metadata", () => {
  it("builds conversation actor metadata without optional empty fields", () => {
    expect(
      buildMessageActorMetadata({
        actorId: "discord:user-123",
        interfaceType: "discord",
        displayName: "Mira Ops",
        username: "mira",
        isBot: false,
      }),
    ).toEqual({
      actorId: "discord:user-123",
      interfaceType: "discord",
      role: "user",
      displayName: "Mira Ops",
      username: "mira",
      isBot: false,
    });
  });

  it("normalizes string bot flags from transport SDKs", () => {
    expect(
      buildMessageActorMetadata({
        actorId: "discord:user-123",
        interfaceType: "discord",
        isBot: "false",
      }).isBot,
    ).toBe(false);
    expect(
      buildMessageActorMetadata({
        actorId: "discord:bot-123",
        interfaceType: "discord",
        isBot: "true",
      }).isBot,
    ).toBe(true);
  });

  it("builds source metadata with transport details", () => {
    expect(
      buildMessageSourceMetadata({
        messageId: "message-1",
        channelId: "discord:guild:channel:thread",
        channelName: "discord:guild:channel",
        threadId: "thread",
        metadata: { guildId: "guild", actionId: "approval.confirm" },
      }),
    ).toEqual({
      messageId: "message-1",
      channelId: "discord:guild:channel:thread",
      channelName: "discord:guild:channel",
      threadId: "thread",
      metadata: { guildId: "guild", actionId: "approval.confirm" },
    });
  });
});
