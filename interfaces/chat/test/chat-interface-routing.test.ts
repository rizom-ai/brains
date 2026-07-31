import { describe, it, expect, mock } from "bun:test";
import type { Mock } from "bun:test";
import { PermissionService } from "@brains/plugins/test";
import type { DiscordChatAdapterConfig } from "../src/config";
import {
  ChatInterface,
  MockChatSdk,
  authState,
  baseSlackConfig,
  createMessage,
  createPlugin,
  createThread,
  discordExternalIdentity,
  setupChatInterfaceTest,
} from "./harness/chat-interface-harness";
import type {
  ChatInterfaceInstance,
  MockMessage,
  MockThread,
} from "./harness/chat-interface-harness";

describe("ChatInterface message routing", () => {
  const suite = setupChatInterfaceTest();

  it("routes Discord mentions to AgentService with discord permission namespace", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const message = createMessage();

    await chat?.handlers.mentions[0]?.(thread, message);

    expect(thread.subscribe).toHaveBeenCalledTimes(1);
    expect(thread.startTyping).toHaveBeenCalledTimes(1);
    expect(suite.agentService.chat).toHaveBeenCalledWith(
      "Hello bot",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({
        interfaceType: "discord",
        channelId: "discord:guild-123:channel-123:thread-456",
        userPermissionLevel: "public",
        actor: expect.objectContaining({
          identity: discordExternalIdentity,
          displayName: "Mira Ops",
          interfaceType: "discord",
        }),
      }),
    );
    expect(thread.post).toHaveBeenCalledWith("Agent response text.");
  });

  it("routes Slack mentions with Slack conversation and permission context", async () => {
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: "slack:C123:1712345678.000100",
      channelId: "slack:C123",
      adapter: { name: "slack" },
    });
    const message = createMessage({
      text: "@U0BGU5CM9QW what can you do for me?",
    });

    await chat?.handlers.mentions[0]?.(thread, message);

    expect(thread.startTyping).toHaveBeenCalledTimes(1);
    expect(suite.agentService.chat).toHaveBeenCalledWith(
      "what can you do for me?",
      "slack-slack:C123:1712345678.000100",
      expect.objectContaining({
        interfaceType: "slack",
        channelId: "slack:C123:1712345678.000100",
        userPermissionLevel: "public",
        actor: expect.objectContaining({
          identity: expect.objectContaining({ kind: "external" }),
          displayName: "Mira Ops",
          interfaceType: "slack",
        }),
      }),
    );
    expect(thread.post).toHaveBeenCalledWith("Agent response text.");
  });

  it("routes subscribed Slack thread follow-ups after an app mention", async () => {
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: "slack:C123:1712345678.000100",
      channelId: "slack:C123",
      adapter: { name: "slack" },
    });

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    suite.agentService.chat.mockClear();
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        text: "Follow-up",
        threadId: thread.id,
        isMention: false,
      }),
    );

    expect(thread.subscribe).toHaveBeenCalledTimes(1);
    expect(suite.agentService.chat).toHaveBeenCalledWith(
      "Follow-up",
      `slack-${thread.id}`,
      expect.objectContaining({ interfaceType: "slack" }),
    );
  });

  it("enforces Slack allowed-channel and DM policies", async () => {
    const plugin = new ChatInterface({
      adapters: {
        slack: {
          ...baseSlackConfig,
          allowedChannels: ["C-allowed"],
          allowDMs: false,
        },
      },
    });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const blockedChannel = createThread({
      id: "slack:C-blocked:1712345678.000100",
      channelId: "slack:C-blocked",
      adapter: { name: "slack" },
    });
    const blockedDM = createThread({
      id: "slack:D123:1712345678.000200",
      channelId: "slack:D123",
      isDM: true,
      adapter: { name: "slack" },
    });

    await chat?.handlers.mentions[0]?.(blockedChannel, createMessage());
    await chat?.handlers.directMessages[0]?.(
      blockedDM,
      createMessage(),
      blockedDM,
    );

    expect(suite.agentService.chat).not.toHaveBeenCalled();
  });

  it("passes queued skipped Discord messages as coalesced context", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const latestMessage = createMessage({
      id: "message-latest",
      text: "actually, save the newest version",
    });
    const skippedMessage = createMessage({
      id: "message-skipped",
      text: "save the first version",
    });

    await chat?.handlers.mentions[0]?.(thread, latestMessage, {
      skipped: [skippedMessage],
      totalSinceLastHandler: 2,
    });

    expect(suite.agentService.chat).toHaveBeenCalledWith(
      expect.stringContaining("Messages received while the previous response"),
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({
        source: expect.objectContaining({
          metadata: expect.objectContaining({
            supersededMessageCount: 1,
            supersededMessageIds: ["message-skipped"],
          }),
        }),
      }),
    );
    expect(suite.agentService.chat.mock.calls[0]?.[0]).toContain(
      "Latest message to answer:\nactually, save the newest version",
    );
  });

  it("does not subscribe mentions that occur inside existing Discord threads", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const message = createMessage({
      raw: {
        guild_id: "guild-123",
        channel_id: "thread-456",
      },
    });

    await chat?.handlers.mentions[0]?.(thread, message);

    expect(thread.subscribe).not.toHaveBeenCalled();
    expect(suite.agentService.chat).toHaveBeenCalledWith(
      "Hello bot",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({ interfaceType: "discord" }),
    );
    expect(thread.post).toHaveBeenCalledWith("Agent response text.");
  });

  it("ignores subscribed Discord thread messages that were not subscribed by this interface", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ isMention: false, text: "unmentioned follow-up" }),
    );

    expect(suite.agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("switches subscribed Discord threads with multiple humans to mention-required mode", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      getParticipants: mock(() =>
        Promise.resolve([
          {
            userId: "user-789",
            userName: "mira",
            fullName: "Mira Ops",
            isBot: false,
            isMe: false,
          },
          {
            userId: "user-999",
            userName: "taro",
            fullName: "Taro Ops",
            isBot: false,
            isMe: false,
          },
        ]),
      ),
    });

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    suite.agentService.chat.mockClear();
    thread.post.mockClear();

    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        id: "follow-up-1",
        isMention: false,
        text: "unmentioned group follow-up",
      }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        id: "follow-up-2",
        isMention: false,
        text: "another unmentioned group follow-up",
      }),
    );

    expect(suite.agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).toHaveBeenCalledTimes(1);
    expect(thread.post).toHaveBeenCalledWith(
      expect.stringContaining("Mention me if you need me"),
    );
  });

  it("routes explicit mentions after subscribed Discord threads switch to mention-required mode", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      getParticipants: mock(() =>
        Promise.resolve([
          {
            userId: "user-789",
            userName: "mira",
            fullName: "Mira Ops",
            isBot: false,
            isMe: false,
          },
          {
            userId: "user-999",
            userName: "taro",
            fullName: "Taro Ops",
            isBot: false,
            isMe: false,
          },
        ]),
      ),
    });

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    suite.agentService.chat.mockClear();
    thread.post.mockClear();

    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        id: "follow-up-1",
        isMention: false,
        text: "unmentioned group follow-up",
      }),
    );
    thread.post.mockClear();

    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        id: "follow-up-2",
        isMention: true,
        text: "@brain please answer this",
      }),
    );

    expect(suite.agentService.chat).toHaveBeenCalledWith(
      "@brain please answer this",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({ interfaceType: "discord" }),
    );
    expect(thread.post).toHaveBeenCalledWith("Agent response text.");
  });

  it("posts the mention-required notice after a mention-triggered group switch", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      getParticipants: mock(() =>
        Promise.resolve([
          {
            userId: "user-789",
            userName: "mira",
            fullName: "Mira Ops",
            isBot: false,
            isMe: false,
          },
          {
            userId: "user-999",
            userName: "taro",
            fullName: "Taro Ops",
            isBot: false,
            isMe: false,
          },
        ]),
      ),
    });

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    suite.agentService.chat.mockClear();
    thread.post.mockClear();

    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        id: "follow-up-1",
        isMention: true,
        text: "@brain please answer this",
      }),
    );
    expect(suite.agentService.chat).toHaveBeenCalledWith(
      "@brain please answer this",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({ interfaceType: "discord" }),
    );
    expect(thread.post).toHaveBeenCalledWith("Agent response text.");

    suite.agentService.chat.mockClear();
    thread.post.mockClear();

    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        id: "follow-up-2",
        isMention: false,
        text: "unmentioned group follow-up",
      }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        id: "follow-up-3",
        isMention: false,
        text: "another unmentioned group follow-up",
      }),
    );

    expect(suite.agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).toHaveBeenCalledTimes(1);
    expect(thread.post).toHaveBeenCalledWith(
      expect.stringContaining("Mention me if you need me"),
    );
  });

  it("routes Discord mentions even when thread subscription fails", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      subscribe: mock(() => Promise.reject(new Error("Missing permissions"))),
    });

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.subscribe).toHaveBeenCalledTimes(1);
    expect(suite.agentService.chat).toHaveBeenCalledWith(
      "Hello bot",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({ interfaceType: "discord" }),
    );
    expect(thread.post).toHaveBeenCalledWith("Agent response text.");
  });

  it("does not subscribe Discord mention threads when thread mode is disabled", async () => {
    const plugin = createPlugin({ useThreads: false });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.subscribe).not.toHaveBeenCalled();
    expect(suite.agentService.chat).toHaveBeenCalled();
    expect(thread.post).toHaveBeenCalledWith("Agent response text.");
  });

  it("does not start Discord typing indicators when disabled", async () => {
    const plugin = createPlugin({ showTypingIndicator: false });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.startTyping).not.toHaveBeenCalled();
    expect(suite.agentService.chat).toHaveBeenCalled();
    expect(thread.post).toHaveBeenCalledWith("Agent response text.");
  });

  it("uses discord permission lookup instead of the chat namespace", async () => {
    const permissionService = new PermissionService({
      rules: [{ pattern: "discord:*", level: "trusted" }],
    });
    suite.harness.setPermissionService(permissionService);
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(createThread(), createMessage());

    const context = suite.agentService.chat.mock.calls[0]?.[2];
    expect(context?.interfaceType).toBe("discord");
    expect(context?.userPermissionLevel).toBe("trusted");
  });

  describe("passive space capture", () => {
    interface MockConversationService {
      startConversation: Mock<
        (request: { sessionId: string }) => Promise<string>
      >;
      addMessage: Mock<(request: unknown) => Promise<void>>;
      getConversation: Mock<() => Promise<null>>;
      listConversations: Mock<() => Promise<never[]>>;
      searchConversations: Mock<() => Promise<never[]>>;
      getMessages: Mock<() => Promise<never[]>>;
      countMessages: Mock<() => Promise<number>>;
      updateConversationMetadata: Mock<() => Promise<boolean>>;
      deleteConversation: Mock<() => Promise<boolean>>;
      close: Mock<() => void>;
    }

    function createConversationService(): MockConversationService {
      return {
        startConversation: mock((request: { sessionId: string }) =>
          Promise.resolve(request.sessionId),
        ),
        addMessage: mock(() => Promise.resolve()),
        getConversation: mock(() => Promise.resolve(null)),
        listConversations: mock(() => Promise.resolve([])),
        searchConversations: mock(() => Promise.resolve([])),
        getMessages: mock(() => Promise.resolve([])),
        countMessages: mock(() => Promise.resolve(0)),
        updateConversationMetadata: mock(() => Promise.resolve(true)),
        deleteConversation: mock(() => Promise.resolve(true)),
        close: mock(() => undefined),
      };
    }

    async function installWithSpaces(
      spaces: string[],
      conversationService: MockConversationService,
      discordConfig: Partial<DiscordChatAdapterConfig> = {},
    ): Promise<ChatInterfaceInstance> {
      const mockShell = suite.harness.getMockShell();
      mockShell.getSpaces = (): string[] => spaces;
      mockShell.getConversationService = (): MockConversationService =>
        conversationService;
      const plugin = createPlugin(discordConfig);
      await suite.harness.installPlugin(plugin);
      return plugin;
    }

    function findCatchAllHandler(
      chat: InstanceType<typeof MockChatSdk> | undefined,
      text: string,
    ):
      | ((thread: MockThread, message: MockMessage) => Promise<void>)
      | undefined {
      return chat?.handlers.messagePatterns.find((entry) =>
        entry.pattern.test(text),
      )?.handler;
    }

    const channelThread = {
      id: "discord:guild-123:channel-123",
      channelId: "discord:guild-123:channel-123",
    };

    it("captures unmentioned space messages without routing them to the agent", async () => {
      const conversationService = createConversationService();
      await installWithSpaces(["discord:channel-123"], conversationService);
      const chat = MockChatSdk.instances[0];
      const thread = createThread(channelThread);
      const message = createMessage({
        text: "Team update for summary",
        isMention: false,
        threadId: "discord:guild-123:channel-123",
      });

      await findCatchAllHandler(chat, message.text)?.(thread, message);

      expect(conversationService.startConversation).toHaveBeenCalledWith({
        sessionId: "discord-discord:guild-123:channel-123",
        interfaceType: "discord",
        channelId: "discord:guild-123:channel-123",
        metadata: {
          channelName: "discord:guild-123:channel-123",
          interfaceType: "discord",
          channelId: "discord:guild-123:channel-123",
        },
      });
      expect(conversationService.addMessage).toHaveBeenCalledWith({
        conversationId: "discord-discord:guild-123:channel-123",
        role: "user",
        content: "Team update for summary",
        metadata: expect.objectContaining({
          actor: expect.objectContaining({
            identity: discordExternalIdentity,
            interfaceType: "discord",
            role: "user",
            displayName: "Mira Ops",
            username: "mira",
            isBot: false,
          }),
          source: expect.objectContaining({
            messageId: "message-123",
            channelId: "discord:guild-123:channel-123",
          }),
        }),
      });
      expect(suite.agentService.chat).not.toHaveBeenCalled();
      expect(thread.post).not.toHaveBeenCalled();
    });

    it("attributes passive space messages to linked canonical users", async () => {
      authState.resolveIdentityAccess = mock(async () => ({
        state: "resolved" as const,
        principal: {
          userId: "usr_mira",
          personId: "per_mira",
          displayName: "Mira",
          role: "trusted" as const,
          status: "active" as const,
          permissionLevel: "trusted" as const,
          isAnchor: false,
          canonicalId: "user:mira",
        },
      }));
      const conversationService = createConversationService();
      await installWithSpaces(["discord:channel-123"], conversationService);
      const chat = MockChatSdk.instances[0];
      const message = createMessage({
        text: "Team update for summary",
        isMention: false,
        threadId: "discord:guild-123:channel-123",
      });

      await findCatchAllHandler(chat, message.text)?.(
        createThread(channelThread),
        message,
      );

      expect(conversationService.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            actor: expect.objectContaining({
              identity: {
                kind: "user",
                userId: "usr_mira",
                canonicalId: "user:mira",
              },
              displayName: "Mira",
            }),
          }),
        }),
      );
    });

    it("ignores unmentioned messages outside configured spaces", async () => {
      const conversationService = createConversationService();
      await installWithSpaces(["discord:other-channel"], conversationService);
      const chat = MockChatSdk.instances[0];
      const message = createMessage({
        text: "Team update for summary",
        isMention: false,
        threadId: "discord:guild-123:channel-123",
      });

      await findCatchAllHandler(chat, message.text)?.(
        createThread(channelThread),
        message,
      );

      expect(conversationService.startConversation).not.toHaveBeenCalled();
      expect(conversationService.addMessage).not.toHaveBeenCalled();
    });

    it("captures thread messages against the configured parent channel space", async () => {
      const conversationService = createConversationService();
      await installWithSpaces(["discord:channel-123"], conversationService);
      const chat = MockChatSdk.instances[0];
      const message = createMessage({
        text: "Thread side chatter",
        isMention: false,
      });

      await findCatchAllHandler(chat, message.text)?.(createThread(), message);

      expect(conversationService.startConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "discord-discord:guild-123:channel-123",
        }),
      );
      expect(conversationService.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "discord-discord:guild-123:channel-123",
          metadata: expect.objectContaining({
            source: expect.objectContaining({
              threadId: "thread-456",
            }),
          }),
        }),
      );
    });

    it("does not double-write space messages the agent turn already records", async () => {
      const conversationService = createConversationService();
      await installWithSpaces(["discord:channel-123"], conversationService, {
        requireMention: false,
      });
      const chat = MockChatSdk.instances[0];
      const message = createMessage({
        text: "No mention needed",
        isMention: false,
        threadId: "discord:guild-123:channel-123",
      });

      await findCatchAllHandler(chat, message.text)?.(
        createThread(channelThread),
        message,
      );

      expect(suite.agentService.chat).toHaveBeenCalledWith(
        "No mention needed",
        "discord-discord:guild-123:channel-123",
        expect.objectContaining({ interfaceType: "discord" }),
      );
      expect(conversationService.addMessage).not.toHaveBeenCalled();
    });

    it("does not double-write mentions answered in the space channel itself", async () => {
      const conversationService = createConversationService();
      await installWithSpaces(["discord:channel-123"], conversationService);
      const chat = MockChatSdk.instances[0];
      const message = createMessage({
        text: "Hello bot",
        isMention: true,
        threadId: "discord:guild-123:channel-123",
      });

      await findCatchAllHandler(chat, message.text)?.(
        createThread(channelThread),
        message,
      );

      expect(conversationService.addMessage).not.toHaveBeenCalled();
    });

    it("skips messages the bot itself authored", async () => {
      const conversationService = createConversationService();
      await installWithSpaces(["discord:channel-123"], conversationService);
      const chat = MockChatSdk.instances[0];
      const message = createMessage({
        text: "Agent response text.",
        isMention: false,
        threadId: "discord:guild-123:channel-123",
        author: {
          userId: "bot-user-123",
          userName: "brain",
          fullName: "Brain",
          isBot: true,
          isMe: true,
        },
      });

      await findCatchAllHandler(chat, message.text)?.(
        createThread(channelThread),
        message,
      );

      expect(conversationService.addMessage).not.toHaveBeenCalled();
    });
  });
});
