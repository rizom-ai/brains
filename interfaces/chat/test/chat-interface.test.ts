import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { createPluginHarness, PermissionService } from "@brains/plugins/test";
import type { PluginTestHarness } from "@brains/plugins/test";
import type { ChatContext } from "@brains/plugins";
import { chunkMessage } from "@brains/utils";
import type { DiscordChatAdapterConfig } from "../src/config";
import type {
  ChatAdapterMap,
  DiscordChatAdapter,
  GatewayListenerOptions,
} from "../src/types";
import type { Mock } from "bun:test";

type HarnessAgentService = Parameters<PluginTestHarness["setAgentService"]>[0];
type HarnessAgentResponse = Awaited<ReturnType<HarnessAgentService["chat"]>>;

interface MockAgentService extends HarnessAgentService {
  chat: Mock<
    (
      message: string,
      conversationId: string,
      context?: ChatContext,
    ) => Promise<HarnessAgentResponse>
  >;
  confirmPendingAction: Mock<
    (
      conversationId: string,
      confirmed: boolean,
    ) => Promise<HarnessAgentResponse>
  >;
  invalidateAgent: () => void;
}

interface MockDiscordAdapter extends DiscordChatAdapter {
  name: "discord";
  startGatewayListener: Mock<
    (
      options: GatewayListenerOptions,
      durationMs?: number,
      abortSignal?: AbortSignal,
      webhookUrl?: string,
    ) => Promise<Response>
  >;
  handleWebhook: Mock<() => Promise<Response>>;
}

interface DiscordAdapterFactoryConfig {
  botToken: string;
  publicKey: string;
  applicationId: string;
  mentionRoleIds: string[];
}

let lastDiscordAdapter: MockDiscordAdapter | undefined;

const createDiscordAdapterMock = mock(
  (_config: DiscordAdapterFactoryConfig) => {
    lastDiscordAdapter = {
      name: "discord",
      startGatewayListener: mock(
        (
          _options: GatewayListenerOptions,
          _durationMs?: number,
          _abortSignal?: AbortSignal,
          _webhookUrl?: string,
        ) =>
          Promise.resolve(
            new Response(JSON.stringify({ status: "listening" })),
          ),
      ),
      handleWebhook: mock(() => Promise.resolve(new Response("ok"))),
    };
    return lastDiscordAdapter;
  },
);

const createMemoryStateMock = mock(() => ({
  connect: mock(() => Promise.resolve()),
  disconnect: mock(() => Promise.resolve()),
}));

interface MockChatSdkConfig {
  adapters: ChatAdapterMap;
  userName?: string;
}

interface RegisteredHandlers {
  directMessages: Array<
    (thread: MockThread, message: MockMessage) => Promise<void>
  >;
  mentions: Array<(thread: MockThread, message: MockMessage) => Promise<void>>;
  messagePatterns: Array<{
    pattern: RegExp;
    handler: (thread: MockThread, message: MockMessage) => Promise<void>;
  }>;
  subscribedMessages: Array<
    (thread: MockThread, message: MockMessage) => Promise<void>
  >;
}

class MockChatSdk {
  static instances: MockChatSdk[] = [];
  readonly config: MockChatSdkConfig;
  readonly handlers: RegisteredHandlers = {
    directMessages: [],
    mentions: [],
    messagePatterns: [],
    subscribedMessages: [],
  };
  readonly webhooks: {
    discord?: Mock<(request: Request) => Promise<Response>>;
  };
  initialize = mock(() => Promise.resolve());
  shutdown = mock(() => Promise.resolve());

  constructor(config: MockChatSdkConfig) {
    this.config = config;
    this.webhooks = config.adapters.discord
      ? {
          discord: mock((_request: Request) =>
            Promise.resolve(new Response("webhook ok")),
          ),
        }
      : {};
    MockChatSdk.instances.push(this);
  }

  onDirectMessage(
    handler: (thread: MockThread, message: MockMessage) => Promise<void>,
  ): void {
    this.handlers.directMessages.push(handler);
  }

  onNewMention(
    handler: (thread: MockThread, message: MockMessage) => Promise<void>,
  ): void {
    this.handlers.mentions.push(handler);
  }

  onNewMessage(
    pattern: RegExp,
    handler: (thread: MockThread, message: MockMessage) => Promise<void>,
  ): void {
    this.handlers.messagePatterns.push({ pattern, handler });
  }

  onSubscribedMessage(
    handler: (thread: MockThread, message: MockMessage) => Promise<void>,
  ): void {
    this.handlers.subscribedMessages.push(handler);
  }
}

void mock.module("chat", () => ({
  Chat: MockChatSdk,
}));

void mock.module("@chat-adapter/discord", () => ({
  createDiscordAdapter: createDiscordAdapterMock,
}));

void mock.module("@chat-adapter/state-memory", () => ({
  createMemoryState: createMemoryStateMock,
}));

const { ChatInterface } = await import("../src/chat-interface");

type ChatInterfaceInstance = InstanceType<typeof ChatInterface>;

interface MockSentMessage {
  id: string;
  edit: Mock<(newContent: string) => Promise<MockSentMessage>>;
}

interface MockThread {
  id: string;
  channelId: string;
  isDM: boolean;
  adapter: { name: string };
  subscribe: Mock<() => Promise<void>>;
  post: Mock<(message: string) => Promise<MockSentMessage>>;
  startTyping: Mock<() => Promise<void>>;
}

interface MockMessage {
  id: string;
  text: string;
  threadId: string;
  isMention?: boolean;
  author: {
    userId: string;
    userName: string;
    fullName: string;
    isBot: boolean;
    isMe: boolean;
  };
  attachments: Array<{
    name?: string;
    mimeType?: string;
    size?: number;
    url?: string;
    fetchData?: () => Promise<Buffer>;
  }>;
  raw: {
    guild_id: string;
    channel_id: string;
  };
}

function createAgentService(): MockAgentService {
  return {
    chat: mock(
      (_message: string, _conversationId: string, _context?: ChatContext) =>
        Promise.resolve({
          text: "Agent response text.",
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        }),
    ),
    confirmPendingAction: mock((_conversationId: string, _confirmed: boolean) =>
      Promise.resolve({
        text: "Action confirmed.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      }),
    ),
    invalidateAgent: (): void => {},
  };
}

function createSentMessage(id = "sent-123"): MockSentMessage {
  const sentMessage: MockSentMessage = {
    id,
    edit: mock((_newContent: string) => Promise.resolve(sentMessage)),
  };
  return sentMessage;
}

function createThread(overrides: Partial<MockThread> = {}): MockThread {
  return {
    id: "discord:guild-123:channel-123:thread-456",
    channelId: "discord:guild-123:channel-123",
    isDM: false,
    adapter: { name: "discord" },
    subscribe: mock(() => Promise.resolve()),
    post: mock((_message: string) => Promise.resolve(createSentMessage())),
    startTyping: mock(() => Promise.resolve()),
    ...overrides,
  };
}

function createMessage(overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: "message-123",
    text: "Hello bot",
    threadId: "discord:guild-123:channel-123:thread-456",
    isMention: true,
    author: {
      userId: "user-789",
      userName: "mira",
      fullName: "Mira Ops",
      isBot: false,
      isMe: false,
    },
    attachments: [],
    raw: {
      guild_id: "guild-123",
      channel_id: "channel-123",
    },
    ...overrides,
  };
}

const baseDiscordConfig: DiscordChatAdapterConfig = {
  botToken: "discord-token",
  publicKey: "a".repeat(64),
  applicationId: "bot-user-123",
  mentionRoleIds: [],
  allowedChannels: [],
  blockedUrlDomains: [],
  requireMention: true,
  allowDMs: true,
  showTypingIndicator: true,
  useThreads: true,
  captureUrls: true,
  captureUrlEmoji: "🔖",
};

function createPlugin(
  discordConfig: Partial<DiscordChatAdapterConfig> = {},
): ChatInterfaceInstance {
  return new ChatInterface({
    adapters: {
      discord: {
        ...baseDiscordConfig,
        ...discordConfig,
      },
    },
    gatewayRunMs: 50,
  });
}

describe("ChatInterface", () => {
  let harness: PluginTestHarness<ChatInterfaceInstance>;
  let agentService: MockAgentService;

  beforeEach(() => {
    MockChatSdk.instances = [];
    createDiscordAdapterMock.mockClear();
    createMemoryStateMock.mockClear();
    agentService = createAgentService();
    harness = createPluginHarness<ChatInterfaceInstance>();
    harness.setAgentService(agentService);
  });

  afterEach(() => {
    harness.reset();
  });

  it("creates a Chat SDK app with Discord adapter credentials and memory state", async () => {
    const plugin = createPlugin();

    await harness.installPlugin(plugin);

    expect(plugin.id).toBe("chat");
    expect(plugin.packageName).toBe("@brains/chat");
    expect(createDiscordAdapterMock).toHaveBeenCalledWith({
      botToken: "discord-token",
      publicKey: "a".repeat(64),
      applicationId: "bot-user-123",
      mentionRoleIds: [],
    });
    expect(createMemoryStateMock).toHaveBeenCalledTimes(1);
    expect(MockChatSdk.instances).toHaveLength(1);
    expect(MockChatSdk.instances[0]?.config).toMatchObject({
      userName: "brain",
    });
  });

  it("does not create a Discord adapter or daemon when Discord is not configured", async () => {
    const plugin = new ChatInterface();

    await harness.installPlugin(plugin);

    expect(createDiscordAdapterMock).not.toHaveBeenCalled();
    expect(createMemoryStateMock).toHaveBeenCalledTimes(1);
    expect(MockChatSdk.instances[0]?.config.adapters.discord).toBeUndefined();
    expect(
      harness.getMockShell().getDaemonRegistry().getByPlugin("chat"),
    ).toEqual([]);
  });

  it("ignores non-Discord threads until their adapters are enabled", async () => {
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: "slack:workspace-123:channel-123:thread-456",
      channelId: "slack:workspace-123:channel-123",
      adapter: { name: "slack" },
    });

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("routes Discord mentions to AgentService with discord permission namespace", async () => {
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const message = createMessage();

    await chat?.handlers.mentions[0]?.(thread, message);

    expect(thread.subscribe).toHaveBeenCalledTimes(1);
    expect(thread.startTyping).toHaveBeenCalledTimes(1);
    expect(agentService.chat).toHaveBeenCalledWith(
      "Hello bot",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({
        interfaceType: "discord",
        channelId: "discord:guild-123:channel-123:thread-456",
        userPermissionLevel: "public",
        actor: expect.objectContaining({
          actorId: "discord:user-789",
          displayName: "Mira Ops",
          interfaceType: "discord",
        }),
      }),
    );
    expect(thread.post).toHaveBeenCalledWith("Agent response text.");
  });

  it("does not subscribe Discord mention threads when thread mode is disabled", async () => {
    const plugin = createPlugin({ useThreads: false });
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.subscribe).not.toHaveBeenCalled();
    expect(agentService.chat).toHaveBeenCalled();
    expect(thread.post).toHaveBeenCalledWith("Agent response text.");
  });

  it("does not start Discord typing indicators when disabled", async () => {
    const plugin = createPlugin({ showTypingIndicator: false });
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.startTyping).not.toHaveBeenCalled();
    expect(agentService.chat).toHaveBeenCalled();
    expect(thread.post).toHaveBeenCalledWith("Agent response text.");
  });

  it("uses platform-specific permission lookup instead of the chat namespace", async () => {
    const permissionService = new PermissionService({
      rules: [{ pattern: "discord:*", level: "trusted" }],
    });
    harness.setPermissionService(permissionService);
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(createThread(), createMessage());

    const context = agentService.chat.mock.calls[0]?.[2];
    expect(context?.interfaceType).toBe("discord");
    expect(context?.userPermissionLevel).toBe("trusted");
  });

  it("chunks long Discord responses instead of letting the adapter truncate", async () => {
    const longResponse = "word ".repeat(500);
    agentService.chat.mockResolvedValueOnce({
      text: longResponse,
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
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
    await harness.installPlugin(plugin);
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

    expect(agentService.chat).toHaveBeenCalledWith(
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
    await harness.installPlugin(plugin);
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

    expect(agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("routes unmentioned channel messages when Discord mention gating is disabled", async () => {
    const plugin = createPlugin({ requireMention: false });
    await harness.installPlugin(plugin);
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

    expect(agentService.chat).toHaveBeenCalledWith(
      "No mention needed",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({ interfaceType: "discord" }),
    );
    expect(thread.post).toHaveBeenCalledWith("Agent response text.");
  });

  it("routes unmentioned URLs as chat when Discord mention gating is disabled", async () => {
    const plugin = createPlugin({ requireMention: false, captureUrls: true });
    await harness.installPlugin(plugin);
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

    expect(agentService.chat).toHaveBeenCalledTimes(1);
    expect(agentService.chat).toHaveBeenCalledWith(
      "Discuss https://example.com/a",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({ interfaceType: "discord" }),
    );
    expect(thread.post).toHaveBeenCalledWith("Agent response text.");
  });

  it("does not capture blocked URL domains", async () => {
    const plugin = createPlugin({ blockedUrlDomains: ["example.com"] });
    await harness.installPlugin(plugin);
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

    expect(agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("does not route Discord DMs when DMs are disabled", async () => {
    const plugin = createPlugin({ allowDMs: false });
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: "discord:@me:dm-channel-123",
      channelId: "discord:@me:dm-channel-123",
      isDM: true,
    });

    await chat?.handlers.directMessages[0]?.(
      thread,
      createMessage({ threadId: thread.id }),
    );

    expect(agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("routes Discord DMs when DMs are enabled", async () => {
    const plugin = createPlugin({ allowDMs: true });
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: "discord:@me:dm-channel-123",
      channelId: "discord:@me:dm-channel-123",
      isDM: true,
    });

    await chat?.handlers.directMessages[0]?.(
      thread,
      createMessage({ threadId: thread.id }),
    );

    expect(agentService.chat).toHaveBeenCalledWith(
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
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    const urlMessage = createMessage({
      text: "worth saving https://example.com/a",
      isMention: false,
    });
    const urlHandler = chat?.handlers.messagePatterns.find((entry) =>
      entry.pattern.test(urlMessage.text),
    );
    await urlHandler?.handler(thread, urlMessage);

    expect(agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("allows Discord thread messages when the parent channel is allowlisted", async () => {
    const plugin = createPlugin({ allowedChannels: ["channel-123"] });
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(agentService.chat).toHaveBeenCalledWith(
      "Hello bot",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({
        interfaceType: "discord",
        channelId: "discord:guild-123:channel-123:thread-456",
      }),
    );
    expect(thread.post).toHaveBeenCalledWith("Agent response text.");
  });

  it("ignores bot messages unless the bot is explicitly mentioned", async () => {
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
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

    expect(agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("does not passively capture URLs from bot messages", async () => {
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
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

    expect(agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("includes trusted text file uploads in the agent message", async () => {
    harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const fetchData = mock(() => Promise.resolve(Buffer.from("file body")));

    await chat?.handlers.mentions[0]?.(
      createThread(),
      createMessage({
        text: "Read this",
        attachments: [
          {
            name: "notes.txt",
            mimeType: "text/plain",
            size: 9,
            fetchData,
          },
        ],
      }),
    );

    expect(fetchData).toHaveBeenCalledTimes(1);
    expect(agentService.chat.mock.calls[0]?.[0]).toContain(
      'User uploaded a file "notes.txt":\n\nfile body',
    );
  });

  it("does not download text uploads for public users", async () => {
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const fetchData = mock(() => Promise.resolve(Buffer.from("file body")));

    await chat?.handlers.mentions[0]?.(
      createThread(),
      createMessage({
        text: "Read this",
        attachments: [
          {
            name: "notes.txt",
            mimeType: "text/plain",
            size: 9,
            fetchData,
          },
        ],
      }),
    );

    expect(fetchData).not.toHaveBeenCalled();
    expect(agentService.chat.mock.calls[0]?.[0]).toBe("Read this");
  });

  it("ignores unsupported and oversized uploads", async () => {
    harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const binaryFetchData = mock(() => Promise.resolve(Buffer.from("binary")));
    const oversizedFetchData = mock(() =>
      Promise.resolve(Buffer.from("large")),
    );

    await chat?.handlers.mentions[0]?.(
      createThread(),
      createMessage({
        text: "Read these",
        attachments: [
          {
            name: "image.png",
            mimeType: "image/png",
            size: 10,
            fetchData: binaryFetchData,
          },
          {
            name: "huge.txt",
            mimeType: "text/plain",
            size: 1024 * 1024 + 1,
            fetchData: oversizedFetchData,
          },
        ],
      }),
    );

    expect(binaryFetchData).not.toHaveBeenCalled();
    expect(oversizedFetchData).not.toHaveBeenCalled();
    expect(agentService.chat.mock.calls[0]?.[0]).toBe("Read these");
  });

  it("continues pending confirmations in the same conversation", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "system_delete",
          summary: "Delete thing",
          args: {},
        },
      ],
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", isMention: false }),
    );

    expect(agentService.confirmPendingAction).toHaveBeenCalledWith(
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-1",
    );
    expect(thread.post).toHaveBeenLastCalledWith("Action confirmed.");
  });

  it("cancels pending confirmations in the same conversation", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "system_delete",
          summary: "Delete thing",
          args: {},
        },
      ],
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "cancel", isMention: false }),
    );

    expect(agentService.confirmPendingAction).toHaveBeenCalledWith(
      "discord-discord:guild-123:channel-123:thread-456",
      false,
      "approval-1",
    );
    expect(thread.post).toHaveBeenLastCalledWith("Action confirmed.");
  });

  it("keeps pending confirmations open after unrecognized replies", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "system_delete",
          summary: "Delete thing",
          args: {},
        },
      ],
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "maybe", isMention: false }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", isMention: false }),
    );

    expect(thread.post).toHaveBeenCalledWith(
      "_Please reply with **yes** to confirm or **no/cancel** to abort._",
    );
    expect(agentService.confirmPendingAction).toHaveBeenCalledTimes(1);
    expect(agentService.confirmPendingAction).toHaveBeenCalledWith(
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-1",
    );
  });

  it("sends an error message when agent chat fails", async () => {
    agentService.chat.mockRejectedValueOnce(new Error("Agent failed"));
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith("**Error:** Agent failed");
  });

  it("edits tracked Discord agent responses for async job progress", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "Queued build.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      toolResults: [{ toolName: "site_build", jobId: "job-123" }],
    });
    const sentMessage = createSentMessage();
    const thread = createThread({
      post: mock((_message: string) => Promise.resolve(sentMessage)),
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await new Promise((resolve) => setTimeout(resolve, 510));
    await harness.sendMessage("job-progress", {
      id: "job-123",
      type: "job",
      status: "processing",
      message: "Building routes",
      progress: { current: 2, total: 4, percentage: 50 },
      metadata: {
        rootJobId: "job-123",
        operationType: "content_operations",
        operationTarget: "Site",
        interfaceType: "discord",
        channelId: thread.id,
      },
    });

    expect(sentMessage.edit).toHaveBeenCalledWith(
      "🔄 **content operations: Site** 2/4 (50%)\nBuilding routes",
    );
  });

  it("edits tracked Discord agent responses when async jobs complete", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "Queued build.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      toolResults: [{ toolName: "site_build", jobId: "job-123" }],
    });
    const sentMessage = createSentMessage();
    const thread = createThread({
      post: mock((_message: string) => Promise.resolve(sentMessage)),
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await harness.sendMessage("job-progress", {
      id: "job-123",
      type: "job",
      status: "completed",
      message: "Done",
      metadata: {
        rootJobId: "job-123",
        operationType: "content_operations",
        operationTarget: "Site",
        interfaceType: "discord",
        channelId: thread.id,
      },
    });

    expect(sentMessage.edit).toHaveBeenCalledWith(
      "✅ **content operations: Site** completed\nDone",
    );
  });

  it("delegates Discord webhook routes to Chat SDK", async () => {
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const route = plugin
      .getWebRoutes()
      .find((candidate) => candidate.path === "/api/webhooks/chat/discord");

    const response = await route?.handler(
      new Request("https://brain.test/hook"),
    );

    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe("webhook ok");
    expect(MockChatSdk.instances[0]?.webhooks.discord).toHaveBeenCalled();
  });

  it("returns 404 from Discord webhook route when no Discord adapter is configured", async () => {
    const plugin = new ChatInterface();
    await harness.installPlugin(plugin);
    const route = plugin
      .getWebRoutes()
      .find((candidate) => candidate.path === "/api/webhooks/chat/discord");

    const response = await route?.handler(
      new Request("https://brain.test/hook"),
    );

    expect(response?.status).toBe(404);
    expect(await response?.text()).toBe("Discord chat webhook not configured");
  });

  it("registers an abortable Discord gateway daemon", async () => {
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const registry = harness.getMockShell().getDaemonRegistry();

    await registry.startPlugin("chat");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await registry.stopPlugin("chat");

    expect(lastDiscordAdapter?.startGatewayListener).toHaveBeenCalled();
    expect(MockChatSdk.instances[0]?.shutdown).toHaveBeenCalled();
    expect(
      lastDiscordAdapter?.startGatewayListener.mock.calls[0]?.[2]?.aborted,
    ).toBe(true);
  });
});
