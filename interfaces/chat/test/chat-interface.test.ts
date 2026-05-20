import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { createPluginHarness, PermissionService } from "@brains/plugins/test";
import type { PluginTestHarness } from "@brains/plugins/test";
import type { ChatContext } from "@brains/plugins";
import type { DiscordChatAdapterConfig } from "../src/config";
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

interface MockDiscordAdapter {
  name: "discord";
  startGatewayListener: Mock<() => Promise<Response>>;
  handleWebhook: Mock<() => Promise<Response>>;
}

let lastDiscordAdapter: MockDiscordAdapter | undefined;

const createDiscordAdapterMock = mock((_config: Record<string, unknown>) => {
  lastDiscordAdapter = {
    name: "discord",
    startGatewayListener: mock(() =>
      Promise.resolve(new Response(JSON.stringify({ status: "listening" }))),
    ),
    handleWebhook: mock(() => Promise.resolve(new Response("ok"))),
  };
  return lastDiscordAdapter;
});

const createMemoryStateMock = mock(() => ({
  connect: mock(() => Promise.resolve()),
  disconnect: mock(() => Promise.resolve()),
}));

interface MockChatSdkConfig {
  adapters: Record<string, unknown>;
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
  readonly webhooks = {
    discord: mock(() => Promise.resolve(new Response("webhook ok"))),
  };
  initialize = mock(() => Promise.resolve());
  shutdown = mock(() => Promise.resolve());

  constructor(config: MockChatSdkConfig) {
    this.config = config;
    MockChatSdk.instances.push(this);
  }

  getAdapter(name: string): unknown {
    return this.config.adapters[name];
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

interface MockThread {
  id: string;
  channelId: string;
  isDM: boolean;
  adapter: { name: string };
  subscribe: Mock<() => Promise<void>>;
  post: Mock<
    (
      message: string,
    ) => Promise<{ id: string; edit: Mock<() => Promise<void>> }>
  >;
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
  raw: unknown;
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

function createThread(overrides: Partial<MockThread> = {}): MockThread {
  return {
    id: "discord:guild-123:channel-123:thread-456",
    channelId: "discord:guild-123:channel-123",
    isDM: false,
    adapter: { name: "discord" },
    subscribe: mock(() => Promise.resolve()),
    post: mock((_message: string) =>
      Promise.resolve({ id: "sent-123", edit: mock(() => Promise.resolve()) }),
    ),
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

  it("continues pending confirmations in the same conversation", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmation: {
        toolName: "system_delete",
        description: "Delete thing",
        args: {},
      },
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
    );
    expect(thread.post).toHaveBeenLastCalledWith("Action confirmed.");
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
  });
});
