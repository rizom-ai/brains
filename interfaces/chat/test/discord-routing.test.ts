import { describe, it, expect } from "bun:test";
import {
  getChannelName,
  getPermissionContext,
  getRawDiscordChannelId,
  getThreadIdParts,
  isAllowedChannel,
  isBotCreatedDiscordThread,
  shouldHandleDiscordAction,
  shouldRouteDiscordMessage,
  type RoutedMessage,
  type RoutedThread,
} from "../src/discord-routing";

function thread(overrides: Partial<RoutedThread> = {}): RoutedThread {
  return {
    id: "discord:guild-1:channel-1",
    channelId: "channel-1",
    isDM: false,
    ...overrides,
  };
}

function message(overrides: Partial<RoutedMessage> = {}): RoutedMessage {
  return {
    raw: {},
    author: { isMe: false, isBot: false },
    ...overrides,
  };
}

describe("getThreadIdParts", () => {
  it("parses discord thread ids into guild/channel/thread parts", () => {
    expect(getThreadIdParts("discord:guild-1:channel-1:thread-1")).toEqual({
      guildId: "guild-1",
      channelId: "channel-1",
      threadId: "thread-1",
    });
    expect(getThreadIdParts("discord:guild-1:channel-1")).toEqual({
      guildId: "guild-1",
      channelId: "channel-1",
    });
  });

  it("returns empty parts for non-discord ids", () => {
    expect(getThreadIdParts("slack:team:channel")).toEqual({});
    expect(getThreadIdParts("plain-id")).toEqual({});
  });
});

describe("getRawDiscordChannelId", () => {
  it("reads channel_id from the raw payload", () => {
    expect(
      getRawDiscordChannelId(message({ raw: { channel_id: "chan-9" } })),
    ).toBe("chan-9");
  });

  it("returns undefined for missing or non-string values", () => {
    expect(getRawDiscordChannelId(message({ raw: null }))).toBeUndefined();
    expect(getRawDiscordChannelId(message({ raw: "nope" }))).toBeUndefined();
    expect(
      getRawDiscordChannelId(message({ raw: { channel_id: 42 } })),
    ).toBeUndefined();
  });
});

describe("isBotCreatedDiscordThread", () => {
  const botThread = thread({
    id: "discord:guild-1:channel-1:thread-1",
  });

  it("detects a bot-created thread when the message came from the parent channel", () => {
    expect(
      isBotCreatedDiscordThread(
        botThread,
        message({ raw: { channel_id: "channel-1" } }),
      ),
    ).toBe(true);
  });

  it("rejects DMs, threads without a thread part, and in-thread messages", () => {
    expect(
      isBotCreatedDiscordThread(
        thread({ isDM: true }),
        message({ raw: { channel_id: "channel-1" } }),
      ),
    ).toBe(false);
    expect(
      isBotCreatedDiscordThread(
        thread(),
        message({ raw: { channel_id: "channel-1" } }),
      ),
    ).toBe(false);
    expect(
      isBotCreatedDiscordThread(
        botThread,
        message({ raw: { channel_id: "thread-1" } }),
      ),
    ).toBe(false);
    expect(isBotCreatedDiscordThread(botThread, message({ raw: {} }))).toBe(
      false,
    );
  });
});

describe("isAllowedChannel", () => {
  it("allows everything when no channels are configured, and all DMs", () => {
    expect(isAllowedChannel(thread(), { allowedChannels: [] })).toBe(true);
    expect(
      isAllowedChannel(thread({ isDM: true }), {
        allowedChannels: ["other"],
      }),
    ).toBe(true);
  });

  it("matches the thread id, channel id, or parsed id parts", () => {
    const config = { allowedChannels: ["channel-1"] };
    expect(isAllowedChannel(thread(), config)).toBe(true);
    expect(
      isAllowedChannel(
        thread({ id: "discord:guild-1:channel-2", channelId: "channel-2" }),
        config,
      ),
    ).toBe(false);
    expect(
      isAllowedChannel(
        thread({
          id: "discord:guild-1:channel-1:thread-9",
          channelId: "thread-9",
        }),
        config,
      ),
    ).toBe(true);
  });
});

describe("shouldRouteDiscordMessage", () => {
  const config = { allowedChannels: [], allowDMs: true };

  it("routes ordinary allowed messages", () => {
    expect(shouldRouteDiscordMessage(thread(), message(), config)).toBe(true);
  });

  it("blocks DMs when disallowed, own messages, and unmentioned bots", () => {
    expect(
      shouldRouteDiscordMessage(thread({ isDM: true }), message(), {
        ...config,
        allowDMs: false,
      }),
    ).toBe(false);
    expect(
      shouldRouteDiscordMessage(
        thread(),
        message({ author: { isMe: true, isBot: true } }),
        config,
      ),
    ).toBe(false);
    expect(
      shouldRouteDiscordMessage(
        thread(),
        message({ author: { isMe: false, isBot: true } }),
        config,
      ),
    ).toBe(false);
    expect(
      shouldRouteDiscordMessage(
        thread(),
        message({ author: { isMe: false, isBot: true }, isMention: true }),
        config,
      ),
    ).toBe(true);
    expect(
      shouldRouteDiscordMessage(thread(), message(), {
        ...config,
        allowedChannels: ["elsewhere"],
      }),
    ).toBe(false);
  });
});

describe("shouldHandleDiscordAction", () => {
  const config = { allowedChannels: [], allowDMs: true };

  it("lets non-discord platforms through and requires config for discord", () => {
    expect(shouldHandleDiscordAction(thread(), "slack", undefined)).toBe(true);
    expect(shouldHandleDiscordAction(thread(), "discord", undefined)).toBe(
      false,
    );
  });

  it("applies DM and channel policy for discord", () => {
    expect(shouldHandleDiscordAction(thread(), "discord", config)).toBe(true);
    expect(
      shouldHandleDiscordAction(thread({ isDM: true }), "discord", {
        ...config,
        allowDMs: false,
      }),
    ).toBe(false);
    expect(
      shouldHandleDiscordAction(thread(), "discord", {
        ...config,
        allowedChannels: ["elsewhere"],
      }),
    ).toBe(false);
  });
});

describe("getPermissionContext", () => {
  it("prefers the parsed channel id and reports bot authorship", () => {
    expect(
      getPermissionContext(
        thread(),
        message({ author: { isMe: false, isBot: true } }),
      ),
    ).toEqual({ channelId: "channel-1", isBot: true });
    expect(getPermissionContext(thread({ id: "plain-id" }), message())).toEqual(
      { channelId: "channel-1", isBot: false },
    );
  });
});

describe("getChannelName", () => {
  it("names DMs and falls back to the channel id", () => {
    expect(getChannelName(thread({ isDM: true }))).toBe("DM");
    expect(getChannelName(thread())).toBe("channel-1");
  });
});
