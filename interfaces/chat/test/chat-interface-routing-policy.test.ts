import { describe, it, expect } from "bun:test";
import { chunkMessage } from "@brains/utils/chunk-message";
import {
  ChatInterface,
  MockChatSdk,
  baseDiscordConfig,
  baseSlackConfig,
  createMessage,
  createPlugin,
  createThread,
  setupChatInterfaceTest,
} from "./harness/chat-interface-harness";

describe("ChatInterface routing policy", () => {
  const suite = setupChatInterfaceTest();

  it("chunks long Discord responses instead of letting the adapter truncate", async () => {
    const longResponse = "word ".repeat(500);
    suite.agentService.chat.mockResolvedValueOnce({
      text: longResponse,
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post.mock.calls.length).toBeGreaterThan(1);
    expect(thread.post.mock.calls.map((call) => String(call[0]))).toEqual(
      chunkMessage(longResponse, 2000),
    );
    for (const call of thread.post.mock.calls) {
      expect(String(call[0]).length).toBeLessThanOrEqual(2000);
    }
  });

  it("captures URLs from unmentioned Discord messages without posting a reply", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const message = createMessage({
      text: "worth saving https://example.com/a",
      isMention: false,
    });

    const urlHandler = chat?.handlers.messagePatterns.find((entry) =>
      entry.pattern.test(message.text),
    );
    await urlHandler?.handler(thread, message);

    expect(suite.agentService.chat).toHaveBeenCalledWith(
      "Save this link: https://example.com/a",
      "links-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({
        interfaceType: "discord",
        channelId: "discord:guild-123:channel-123:thread-456",
      }),
    );
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("does not capture URLs when Discord URL capture is disabled", async () => {
    const plugin = createPlugin({ captureUrls: false });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const message = createMessage({
      text: "do not save https://example.com/a",
      isMention: false,
    });

    const urlHandler = chat?.handlers.messagePatterns.find((entry) =>
      entry.pattern.test(message.text),
    );
    await urlHandler?.handler(thread, message);

    expect(suite.agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("routes unmentioned channel messages when Discord mention gating is disabled", async () => {
    const plugin = createPlugin({ requireMention: false });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const message = createMessage({
      text: "No mention needed",
      isMention: false,
    });

    const catchAllHandler = chat?.handlers.messagePatterns.find((entry) =>
      entry.pattern.test(message.text),
    );
    await catchAllHandler?.handler(thread, message);

    expect(suite.agentService.chat).toHaveBeenCalledWith(
      "No mention needed",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({ interfaceType: "discord" }),
    );
    expect(thread.post).toHaveBeenCalledWith("Agent response text.");
  });

  it("keeps mention policy isolated when Discord and Slack run together", async () => {
    const plugin = new ChatInterface({
      adapters: {
        discord: baseDiscordConfig,
        slack: { ...baseSlackConfig, requireMention: false },
      },
    });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const discordThread = createThread();
    const slackThread = createThread({
      id: "slack:C123:1712345678.000100",
      channelId: "slack:C123",
      adapter: { name: "slack" },
    });
    const message = createMessage({ text: "No mention", isMention: false });
    const catchAllHandler = chat?.handlers.messagePatterns.find((entry) =>
      entry.pattern.test(message.text),
    );

    await catchAllHandler?.handler(discordThread, message);
    expect(suite.agentService.chat).not.toHaveBeenCalled();

    await catchAllHandler?.handler(slackThread, message);
    expect(suite.agentService.chat).toHaveBeenCalledWith(
      "No mention",
      `slack-${slackThread.id}`,
      expect.objectContaining({ interfaceType: "slack" }),
    );
  });

  it("routes unmentioned URLs as chat when Discord mention gating is disabled", async () => {
    const plugin = createPlugin({ requireMention: false, captureUrls: true });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const message = createMessage({
      text: "Discuss https://example.com/a",
      isMention: false,
    });

    for (const entry of chat?.handlers.messagePatterns ?? []) {
      if (entry.pattern.test(message.text)) {
        await entry.handler(thread, message);
      }
    }

    expect(suite.agentService.chat).toHaveBeenCalledTimes(1);
    expect(suite.agentService.chat).toHaveBeenCalledWith(
      "Discuss https://example.com/a",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({ interfaceType: "discord" }),
    );
    expect(thread.post).toHaveBeenCalledWith("Agent response text.");
  });

  it("does not capture blocked URL domains", async () => {
    const plugin = createPlugin({ blockedUrlDomains: ["example.com"] });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const message = createMessage({
      text: "blocked https://example.com/a",
      isMention: false,
    });

    const urlHandler = chat?.handlers.messagePatterns.find((entry) =>
      entry.pattern.test(message.text),
    );
    await urlHandler?.handler(thread, message);

    expect(suite.agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("does not route Discord DMs when DMs are disabled", async () => {
    const plugin = createPlugin({ allowDMs: false });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: "discord:@me:dm-channel-123",
      channelId: "discord:@me:dm-channel-123",
      isDM: true,
    });

    await chat?.handlers.directMessages[0]?.(
      thread,
      createMessage({ threadId: thread.id }),
      thread,
    );

    expect(suite.agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("routes Discord DMs when DMs are enabled", async () => {
    const plugin = createPlugin({ allowDMs: true });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: "discord:@me:dm-channel-123",
      channelId: "discord:@me:dm-channel-123",
      isDM: true,
    });

    await chat?.handlers.directMessages[0]?.(
      thread,
      createMessage({ threadId: thread.id }),
      thread,
    );

    expect(suite.agentService.chat).toHaveBeenCalledWith(
      "Hello bot",
      "discord-discord:@me:dm-channel-123",
      expect.objectContaining({
        channelName: "DM",
        interfaceType: "discord",
      }),
    );
    expect(thread.post).toHaveBeenCalledWith("Agent response text.");
  });

  it("gates Discord chat and URL capture by allowed channels", async () => {
    const plugin = createPlugin({ allowedChannels: ["other-channel"] });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.subscribe).not.toHaveBeenCalled();

    const urlMessage = createMessage({
      text: "worth saving https://example.com/a",
      isMention: false,
    });
    const urlHandler = chat?.handlers.messagePatterns.find((entry) =>
      entry.pattern.test(urlMessage.text),
    );
    await urlHandler?.handler(thread, urlMessage);

    expect(suite.agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("allows Discord thread messages when the parent channel is allowlisted", async () => {
    const plugin = createPlugin({ allowedChannels: ["channel-123"] });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(suite.agentService.chat).toHaveBeenCalledWith(
      "Hello bot",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({
        interfaceType: "discord",
        channelId: "discord:guild-123:channel-123:thread-456",
      }),
    );
    expect(thread.post).toHaveBeenCalledWith("Agent response text.");
  });

  it("ignores messages authored by itself even when mentioned", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        isMention: true,
        author: {
          userId: "bot-user-123",
          userName: "brain",
          fullName: "Brain Bot",
          isBot: true,
          isMe: true,
        },
      }),
    );

    expect(thread.subscribe).not.toHaveBeenCalled();
    expect(suite.agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("ignores bot messages unless the bot is explicitly mentioned", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        isMention: false,
        author: {
          userId: "bot-456",
          userName: "helper-bot",
          fullName: "Helper Bot",
          isBot: true,
          isMe: false,
        },
      }),
    );

    expect(suite.agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("does not passively capture URLs from messages authored by itself", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const urlMessage = createMessage({
      text: "self saw https://example.com/a",
      isMention: false,
      author: {
        userId: "bot-user-123",
        userName: "brain",
        fullName: "Brain Bot",
        isBot: false,
        isMe: true,
      },
    });
    const urlHandler = chat?.handlers.messagePatterns.find((entry) =>
      entry.pattern.test(urlMessage.text),
    );

    await urlHandler?.handler(thread, urlMessage);

    expect(suite.agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("does not passively capture URLs from bot messages", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const urlMessage = createMessage({
      text: "bot saw https://example.com/a",
      isMention: false,
      author: {
        userId: "bot-456",
        userName: "helper-bot",
        fullName: "Helper Bot",
        isBot: true,
        isMe: false,
      },
    });
    const urlHandler = chat?.handlers.messagePatterns.find((entry) =>
      entry.pattern.test(urlMessage.text),
    );

    await urlHandler?.handler(thread, urlMessage);

    expect(suite.agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });
});
