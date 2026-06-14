import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { createPluginHarness, PermissionService } from "@brains/plugins/test";
import type { PluginTestHarness } from "@brains/plugins/test";
import type { ChatContext, ToolActivityEvent } from "@brains/plugins";
import { chunkMessage } from "@brains/utils";
import { createDiscordChatUploadStoreScope } from "../src/upload-store";
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
type ChatInterfaceWithToolActivity = ChatInterfaceInstance & {
  handleToolActivityEvent(event: ToolActivityEvent): Promise<void>;
};

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

  it("ignores non-Discord Chat SDK threads", async () => {
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: "other:workspace-123:channel-123:thread-456",
      channelId: "other:workspace-123:channel-123",
      adapter: { name: "other" },
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

  it("uses discord permission lookup instead of the chat namespace", async () => {
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

  it("passes trusted text file uploads as durable native attachments", async () => {
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
    expect(agentService.chat.mock.calls[0]?.[0]).toBe("Read this");
    expect(agentService.chat.mock.calls[0]?.[2]?.attachments).toEqual([
      {
        kind: "text",
        filename: "notes.txt",
        mediaType: "text/plain",
        content: "file body",
        sizeBytes: 9,
        source: {
          kind: "discord-chat-upload",
          id: expect.stringMatching(/^upload-/),
        },
      },
    ]);
    const source =
      agentService.chat.mock.calls[0]?.[2]?.attachments?.[0]?.source;
    const uploadStore = harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped(createDiscordChatUploadStoreScope());
    const record = await uploadStore.readRecord(source?.id ?? "");
    expect(record.metadata).toEqual({
      interfaceType: "discord",
      channelId: "discord:guild-123:channel-123:thread-456",
      parentChannelId: "discord:guild-123:channel-123",
      messageId: "message-123",
      uploaderId: "user-789",
      uploaderUsername: "mira",
      guildId: "guild-123",
      threadId: "thread-456",
    });
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

  it("does not download binary uploads for public users", async () => {
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const imageFetchData = mock(() => Promise.resolve(Buffer.from("image")));
    const pdfFetchData = mock(() => Promise.resolve(Buffer.from("pdf")));

    await chat?.handlers.mentions[0]?.(
      createThread(),
      createMessage({
        text: "Use these",
        attachments: [
          {
            name: "diagram.png",
            mimeType: "image/png",
            size: 5,
            fetchData: imageFetchData,
          },
          {
            name: "brief.pdf",
            mimeType: "application/pdf",
            size: 3,
            fetchData: pdfFetchData,
          },
        ],
      }),
    );

    expect(imageFetchData).not.toHaveBeenCalled();
    expect(pdfFetchData).not.toHaveBeenCalled();
    expect(agentService.chat.mock.calls[0]?.[0]).toBe("Use these");
    expect(agentService.chat.mock.calls[0]?.[2]?.attachments).toBeUndefined();
  });

  it("passes trusted image and PDF uploads as durable native file attachments", async () => {
    harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const pdf = Buffer.from("%PDF-1.7");
    const imageFetchData = mock(() => Promise.resolve(image));
    const pdfFetchData = mock(() => Promise.resolve(pdf));

    await chat?.handlers.mentions[0]?.(
      createThread(),
      createMessage({
        text: "Use these",
        attachments: [
          {
            name: "diagram.png",
            mimeType: "image/png",
            size: image.byteLength,
            fetchData: imageFetchData,
          },
          {
            name: "brief.pdf",
            mimeType: "application/pdf",
            size: pdf.byteLength,
            fetchData: pdfFetchData,
          },
        ],
      }),
    );

    expect(imageFetchData).toHaveBeenCalledTimes(1);
    expect(pdfFetchData).toHaveBeenCalledTimes(1);
    expect(agentService.chat.mock.calls[0]?.[0]).toBe("Use these");
    expect(agentService.chat.mock.calls[0]?.[2]?.attachments).toEqual([
      {
        kind: "file",
        filename: "diagram.png",
        mediaType: "image/png",
        data: image,
        sizeBytes: image.byteLength,
        source: {
          kind: "discord-chat-upload",
          id: expect.stringMatching(/^upload-/),
        },
      },
      {
        kind: "file",
        filename: "brief.pdf",
        mediaType: "application/pdf",
        data: pdf,
        sizeBytes: pdf.byteLength,
        source: {
          kind: "discord-chat-upload",
          id: expect.stringMatching(/^upload-/),
        },
      },
    ]);
  });

  it("reports unsupported, oversized, and spoofed uploads", async () => {
    harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const unsupportedFetchData = mock(() =>
      Promise.resolve(Buffer.from("binary")),
    );
    const oversizedFetchData = mock(() =>
      Promise.resolve(Buffer.from("large")),
    );
    const spoofedFetchData = mock(() =>
      Promise.resolve(Buffer.from([0x00, 0x01, 0x02])),
    );

    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "Read these",
        attachments: [
          {
            name: "archive.bin",
            mimeType: "application/octet-stream",
            size: 10,
            fetchData: unsupportedFetchData,
          },
          {
            name: "huge.txt",
            mimeType: "text/plain",
            size: 1024 * 1024 + 1,
            fetchData: oversizedFetchData,
          },
          {
            name: "fake-notes.txt",
            mimeType: "text/plain",
            size: 3,
            fetchData: spoofedFetchData,
          },
        ],
      }),
    );

    expect(unsupportedFetchData).not.toHaveBeenCalled();
    expect(oversizedFetchData).not.toHaveBeenCalled();
    expect(spoofedFetchData).toHaveBeenCalledTimes(1);
    expect(thread.post).toHaveBeenNthCalledWith(
      1,
      [
        "Some uploads were skipped:",
        "- Unsupported file upload type: archive.bin",
        "- File upload too large: huge.txt",
        "- Unsupported file upload type: fake-notes.txt",
      ].join("\n"),
    );
    expect(agentService.chat.mock.calls[0]?.[0]).toBe("Read these");
    expect(agentService.chat.mock.calls[0]?.[2]?.attachments).toBeUndefined();
  });

  it("reports skipped uploads without calling the agent when no usable input remains", async () => {
    harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "",
        attachments: [
          {
            name: "archive.bin",
            mimeType: "application/octet-stream",
            size: 10,
            fetchData: mock(() => Promise.resolve(Buffer.from("binary"))),
          },
        ],
      }),
    );

    expect(agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).toHaveBeenCalledWith(
      "Some uploads were skipped:\n- Unsupported file upload type: archive.bin",
    );
  });

  it("reuses the most recent trusted upload on follow-up requests", async () => {
    harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const firstImage = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1]);
    const secondImage = Buffer.from([0x89, 0x50, 0x4e, 0x47, 2]);

    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "store this",
        attachments: [
          {
            name: "first-robot.png",
            mimeType: "image/png",
            size: firstImage.byteLength,
            fetchData: mock(() => Promise.resolve(firstImage)),
          },
        ],
      }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        text: "store this too",
        isMention: false,
        attachments: [
          {
            name: "second-robot.png",
            mimeType: "image/png",
            size: secondImage.byteLength,
            fetchData: mock(() => Promise.resolve(secondImage)),
          },
        ],
      }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        text: "describe the most recent image",
        isMention: false,
      }),
    );

    expect(agentService.chat.mock.calls[2]?.[0]).toBe(
      "describe the most recent image",
    );
    expect(agentService.chat.mock.calls[2]?.[2]?.attachments).toEqual([
      expect.objectContaining({
        kind: "file",
        filename: "second-robot.png",
        mediaType: "image/png",
        data: secondImage,
      }),
    ]);
  });

  it("reuses the first trusted upload on follow-up requests", async () => {
    harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const firstImage = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1]);
    const secondImage = Buffer.from([0x89, 0x50, 0x4e, 0x47, 2]);

    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "store first",
        attachments: [
          {
            name: "first-robot.png",
            mimeType: "image/png",
            size: firstImage.byteLength,
            fetchData: mock(() => Promise.resolve(firstImage)),
          },
        ],
      }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        text: "store second",
        isMention: false,
        attachments: [
          {
            name: "second-robot.png",
            mimeType: "image/png",
            size: secondImage.byteLength,
            fetchData: mock(() => Promise.resolve(secondImage)),
          },
        ],
      }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        text: "describe the first image",
        isMention: false,
      }),
    );

    expect(agentService.chat.mock.calls[2]?.[2]?.attachments).toEqual([
      expect.objectContaining({
        kind: "file",
        filename: "first-robot.png",
        mediaType: "image/png",
        data: firstImage,
      }),
    ]);
  });

  it("selects prior trusted uploads by filename on follow-up requests", async () => {
    harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const firstImage = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1]);
    const secondImage = Buffer.from([0x89, 0x50, 0x4e, 0x47, 2]);

    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "store these",
        attachments: [
          {
            name: "first-robot.png",
            mimeType: "image/png",
            size: firstImage.byteLength,
            fetchData: mock(() => Promise.resolve(firstImage)),
          },
          {
            name: "second-robot.png",
            mimeType: "image/png",
            size: secondImage.byteLength,
            fetchData: mock(() => Promise.resolve(secondImage)),
          },
        ],
      }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        text: "describe first-robot.png",
        isMention: false,
      }),
    );

    expect(agentService.chat.mock.calls[1]?.[0]).toBe(
      "describe first-robot.png",
    );
    expect(agentService.chat.mock.calls[1]?.[2]?.attachments).toEqual([
      expect.objectContaining({
        kind: "file",
        filename: "first-robot.png",
        mediaType: "image/png",
        data: firstImage,
      }),
    ]);
  });

  it("restores prior uploads from stored conversation metadata after restart", async () => {
    harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    const image = Buffer.from([7, 8, 9]);
    const uploadStore = harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped(createDiscordChatUploadStoreScope());
    const record = await uploadStore.save({
      filename: "stored-robot.png",
      mediaType: "image/png",
      content: image,
    });
    const conversationId = "discord-discord:guild-123:channel-123:thread-456";
    harness.getMockShell().getConversationService = (): never =>
      ({
        startConversation: mock(() => Promise.resolve(conversationId)),
        addMessage: mock(() => Promise.resolve()),
        getConversation: mock(() => Promise.resolve(null)),
        listConversations: mock(() => Promise.resolve([])),
        searchConversations: mock(() => Promise.resolve([])),
        getMessages: mock(() =>
          Promise.resolve([
            {
              id: "stored-message-1",
              conversationId,
              role: "user",
              content: "uploaded image",
              timestamp: new Date().toISOString(),
              metadata: JSON.stringify({
                attachments: [
                  {
                    kind: "file",
                    filename: record.filename,
                    mediaType: record.mediaType,
                    sizeBytes: record.sizeBytes,
                    source: record.ref,
                  },
                ],
              }),
            },
          ]),
        ),
        countMessages: mock(() => Promise.resolve(1)),
        updateConversationMetadata: mock(() => Promise.resolve(false)),
        deleteConversation: mock(() => Promise.resolve(false)),
        close: mock(() => {}),
      }) as never;
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(
      createThread(),
      createMessage({ text: "describe stored-robot.png" }),
    );

    expect(agentService.chat.mock.calls[0]?.[0]).toBe(
      "describe stored-robot.png",
    );
    expect(agentService.chat.mock.calls[0]?.[2]?.attachments).toEqual([
      expect.objectContaining({
        kind: "file",
        filename: "stored-robot.png",
        mediaType: "image/png",
        data: image,
      }),
    ]);
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
    expect(thread.post).toHaveBeenCalledWith(
      [
        "Please confirm.",
        "**Pending approval:** Delete thing\nApproval id: `approval-1`\nReply with **yes** to confirm or **no/cancel** to abort.",
      ].join("\n\n"),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", isMention: false }),
    );

    expect(agentService.confirmPendingAction).toHaveBeenCalledWith(
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-1",
    );
    expect(thread.post).toHaveBeenLastCalledWith(
      "✅ Approved · Action confirmed.",
    );
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
    expect(thread.post).toHaveBeenLastCalledWith("🚫 Declined");
  });

  it("summarizes failed confirmed actions without raw JSON", async () => {
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
    agentService.confirmPendingAction.mockResolvedValueOnce({
      text: 'Completed: Delete thing\n\nResult: {\n  "success": false,\n  "error": "Entity not found: base/woodchuck-note"\n}',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      toolResults: [
        {
          toolName: "system_delete",
          data: {
            success: false,
            error: "Entity not found: base/woodchuck-note",
          },
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

    expect(thread.post).toHaveBeenLastCalledWith(
      "❌ Delete failed · Entity not found: base/woodchuck-note",
    );
    expect(thread.post.mock.calls.at(-1)?.[0]).not.toContain('"success"');
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

  it("requires an approval id when multiple confirmations are pending", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "system_publish",
          summary: "Publish one",
          args: {},
        },
        {
          id: "approval-2",
          toolName: "system_publish",
          summary: "Publish two",
          args: {},
        },
      ],
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    expect(thread.post).toHaveBeenCalledWith(
      [
        "Please confirm.",
        "**Pending approvals:**\n- `approval-1` — Publish one\n- `approval-2` — Publish two\nReply with **yes <approval-id>** to confirm one item, or **no <approval-id>** to abort it.",
      ].join("\n\n"),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", isMention: false }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes approval-2", isMention: false }),
    );

    expect(thread.post).toHaveBeenCalledWith(
      "_Multiple approvals are pending; include one approval id with **yes** or **no/cancel**: approval-1, approval-2._",
    );
    expect(agentService.confirmPendingAction).toHaveBeenCalledWith(
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-2",
    );
  });

  it("restores pending approvals from stored conversation metadata", async () => {
    const conversationId = "discord-discord:guild-123:channel-123:thread-456";
    harness.getMockShell().getConversationService = (): never =>
      ({
        startConversation: mock(() => Promise.resolve(conversationId)),
        addMessage: mock(() => Promise.resolve()),
        getConversation: mock(() => Promise.resolve(null)),
        listConversations: mock(() => Promise.resolve([])),
        searchConversations: mock(() => Promise.resolve([])),
        getMessages: mock(() =>
          Promise.resolve([
            {
              id: "assistant-message-1",
              conversationId,
              role: "assistant",
              content: "Please confirm.",
              timestamp: new Date().toISOString(),
              metadata: JSON.stringify({
                cards: [
                  {
                    kind: "tool-approval",
                    id: "approval-1",
                    toolName: "system_publish",
                    summary: "Publish restored post",
                    state: "approval-requested",
                  },
                ],
              }),
            },
          ]),
        ),
        countMessages: mock(() => Promise.resolve(1)),
        updateConversationMetadata: mock(() => Promise.resolve(false)),
        deleteConversation: mock(() => Promise.resolve(false)),
        close: mock(() => {}),
      }) as never;
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(
      createThread(),
      createMessage({ text: "yes approval-1" }),
    );

    expect(agentService.chat).not.toHaveBeenCalled();
    expect(agentService.confirmPendingAction).toHaveBeenCalledWith(
      conversationId,
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

  it("formats structured artifact cards as Discord-readable summaries", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "Generated the deck.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Deck carousel",
          description: "Ready to review.",
          attachment: {
            mediaType: "application/pdf",
            url: "https://brain.test/api/chat/attachments/document?id=deck-1",
            downloadUrl:
              "https://brain.test/api/chat/attachments/document?id=deck-1&download=1",
            previewUrl:
              "https://brain.test/api/chat/attachments/document?id=deck-1&preview=1",
            filename: "deck-carousel.pdf",
            sizeBytes: 1234,
          },
        },
      ],
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith(
      [
        "Generated the deck.",
        "**Artifact:** Deck carousel\nReady to review.\nFile: deck-carousel.pdf\nType: application/pdf\nSize: 1.2 KB\nPreview: https://brain.test/api/chat/attachments/document?id=deck-1&preview=1\nOpen: https://brain.test/api/chat/attachments/document?id=deck-1\nDownload: https://brain.test/api/chat/attachments/document?id=deck-1&download=1",
      ].join("\n\n"),
    );
  });

  it("formats relative structured artifact links as absolute Discord-readable URLs", async () => {
    harness.reset();
    harness = createPluginHarness<ChatInterfaceInstance>({
      domain: "brain.test",
    });
    harness.setAgentService(agentService);
    agentService.chat.mockResolvedValueOnce({
      text: "Generated the image.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Robot image",
          attachment: {
            mediaType: "image/png",
            url: "/api/chat/attachments/image?id=robot-1",
            downloadUrl: "/api/chat/attachments/image?id=robot-1&download=1",
            previewUrl: "/api/chat/attachments/image?id=robot-1&preview=1",
            filename: "robot.png",
          },
        },
      ],
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith(
      [
        "Generated the image.",
        "**Artifact:** Robot image\nFile: robot.png\nType: image/png\nPreview: https://brain.test/api/chat/attachments/image?id=robot-1&preview=1\nOpen: https://brain.test/api/chat/attachments/image?id=robot-1\nDownload: https://brain.test/api/chat/attachments/image?id=robot-1&download=1",
      ].join("\n\n"),
    );
  });

  it("prefers local site URLs for relative structured artifact links when configured", async () => {
    harness.reset();
    harness = createPluginHarness<ChatInterfaceInstance>({
      domain: "brain.test",
      localSiteUrl: "http://localhost:4321",
      preferLocalUrls: true,
    });
    harness.setAgentService(agentService);
    agentService.chat.mockResolvedValueOnce({
      text: "Generated local preview.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Local robot",
          attachment: {
            mediaType: "image/png",
            url: "/api/chat/attachments/image?id=robot-local",
            filename: "robot.png",
          },
        },
      ],
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith(
      [
        "Generated local preview.",
        "**Artifact:** Local robot\nFile: robot.png\nType: image/png\nOpen: http://localhost:4321/api/chat/attachments/image?id=robot-local",
      ].join("\n\n"),
    );
  });

  it("formats structured approval cards without raw JSON", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "Approval needed.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "tool-approval",
          id: "approval-card-1",
          toolName: "system_publish",
          summary: "Publish Launch Post",
          preview: "This will publish the draft post.",
          state: "approval-requested",
          input: { entityId: "post-1" },
        },
        {
          kind: "tool-approval",
          id: "approval-card-2",
          toolName: "system_publish",
          summary: "Publish Follow-up",
          state: "output-available",
          output: { ok: true, internal: "not for discord" },
        },
      ],
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith(
      [
        "Approval needed.",
        "**Approval:** Publish Launch Post\nStatus: approval-requested\nThis will publish the draft post.",
        "**Approval:** Publish Follow-up\nStatus: output-available",
      ].join("\n\n"),
    );
    expect(thread.post.mock.calls[0]?.[0]).not.toContain("internal");
  });

  it("edits Discord tool activity status messages", async () => {
    const statusMessage = createSentMessage("status-1");
    const thread = createThread({
      post: mock((_message: string) => Promise.resolve(statusMessage)),
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    thread.post.mockClear();
    statusMessage.edit.mockClear();

    const toolInterface = plugin as unknown as ChatInterfaceWithToolActivity;
    await toolInterface.handleToolActivityEvent({
      type: "tool:invoking",
      toolName: "system_publish",
      conversationId: "discord-discord:guild-123:channel-123:thread-456",
      interfaceType: "discord",
      channelId: thread.id,
    });
    await toolInterface.handleToolActivityEvent({
      type: "tool:completed",
      toolName: "system_publish",
      conversationId: "discord-discord:guild-123:channel-123:thread-456",
      interfaceType: "discord",
      channelId: thread.id,
    });

    expect(thread.post).toHaveBeenCalledWith("⏳ **system publish** running…");
    expect(statusMessage.edit).toHaveBeenCalledWith(
      "✅ **system publish** completed.",
    );
  });

  it("ignores tool activity outside enabled Discord channels", async () => {
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    thread.post.mockClear();

    await (
      plugin as unknown as ChatInterfaceWithToolActivity
    ).handleToolActivityEvent({
      type: "tool:invoking",
      toolName: "system_publish",
      conversationId: "web-chat-session",
      interfaceType: "web-chat",
      channelId: thread.id,
    });

    expect(thread.post).not.toHaveBeenCalled();
  });

  it("reports failed Discord tool activity when no status message is tracked", async () => {
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    thread.post.mockClear();

    await (
      plugin as unknown as ChatInterfaceWithToolActivity
    ).handleToolActivityEvent({
      type: "tool:failed",
      toolName: "system_publish",
      conversationId: "discord-discord:guild-123:channel-123:thread-456",
      interfaceType: "discord",
      channelId: thread.id,
      error: "Publish failed",
    });

    expect(thread.post).toHaveBeenCalledWith(
      "❌ **system publish** failed: Publish failed",
    );
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

  it("returns 404 from Discord upload route when no Discord adapter is configured", async () => {
    const plugin = new ChatInterface();
    await harness.installPlugin(plugin);
    const route = plugin
      .getWebRoutes()
      .find(
        (candidate) =>
          candidate.path === "/api/webhooks/chat/discord/uploads" &&
          candidate.method === "GET",
      );

    const response = await route?.handler(
      new Request(
        "https://brain.test/api/webhooks/chat/discord/uploads?id=upload-00000000-0000-4000-8000-000000000000",
      ),
    );

    expect(response?.status).toBe(404);
    expect(await response?.text()).toBe("Discord chat uploads not configured");
  });

  it("serves stored Discord upload refs through the upload route", async () => {
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const uploadStore = harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped(createDiscordChatUploadStoreScope());
    const record = await uploadStore.save({
      filename: 'déck "draft".pdf',
      mediaType: "application/pdf",
      content: Buffer.from("%PDF-1.7"),
    });
    const route = plugin
      .getWebRoutes()
      .find(
        (candidate) =>
          candidate.path === "/api/webhooks/chat/discord/uploads" &&
          candidate.method === "GET",
      );

    const inlineResponse = await route?.handler(
      new Request(
        `https://brain.test/api/webhooks/chat/discord/uploads?id=${record.id}`,
      ),
    );
    const downloadResponse = await route?.handler(
      new Request(
        `https://brain.test/api/webhooks/chat/discord/uploads?id=${record.id}&download=1`,
      ),
    );

    expect(inlineResponse?.status).toBe(200);
    expect(inlineResponse?.headers.get("Content-Type")).toBe("application/pdf");
    expect(inlineResponse?.headers.get("Cache-Control")).toBe(
      "private, no-store",
    );
    expect(inlineResponse?.headers.get("X-Content-Type-Options")).toBe(
      "nosniff",
    );
    expect(inlineResponse?.headers.get("Content-Disposition")).toBe(
      "inline; filename=\"d_ck _draft_.pdf\"; filename*=UTF-8''d%C3%A9ck%20%22draft%22.pdf",
    );
    expect(await inlineResponse?.text()).toBe("%PDF-1.7");
    expect(downloadResponse?.status).toBe(200);
    expect(downloadResponse?.headers.get("Content-Disposition")).toBe(
      "attachment; filename=\"d_ck _draft_.pdf\"; filename*=UTF-8''d%C3%A9ck%20%22draft%22.pdf",
    );
  });

  it("does not serve upload refs from other runtime upload scopes", async () => {
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const otherUploadStore = harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped({
        namespace: "web-chat",
        refKind: "web-chat-upload",
        routePath: "/api/chat/uploads",
      });
    const record = await otherUploadStore.save({
      filename: "private.txt",
      mediaType: "text/plain",
      content: Buffer.from("not a discord source upload"),
    });
    const route = plugin
      .getWebRoutes()
      .find(
        (candidate) =>
          candidate.path === "/api/webhooks/chat/discord/uploads" &&
          candidate.method === "GET",
      );

    const response = await route?.handler(
      new Request(
        `https://brain.test/api/webhooks/chat/discord/uploads?id=${record.id}`,
      ),
    );

    expect(response?.status).toBe(404);
    expect(await response?.text()).toBe("Upload not found");
  });

  it("rejects missing, malformed, or unknown Discord upload refs", async () => {
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const route = plugin
      .getWebRoutes()
      .find(
        (candidate) =>
          candidate.path === "/api/webhooks/chat/discord/uploads" &&
          candidate.method === "GET",
      );

    const missing = await route?.handler(
      new Request("https://brain.test/api/webhooks/chat/discord/uploads"),
    );
    const malformed = await route?.handler(
      new Request(
        "https://brain.test/api/webhooks/chat/discord/uploads?id=../secret",
      ),
    );
    const unknown = await route?.handler(
      new Request(
        "https://brain.test/api/webhooks/chat/discord/uploads?id=upload-00000000-0000-4000-8000-000000000000",
      ),
    );

    expect(missing?.status).toBe(400);
    expect(await missing?.text()).toBe("Missing upload id");
    expect(malformed?.status).toBe(404);
    expect(await malformed?.text()).toBe("Upload not found");
    expect(unknown?.status).toBe(404);
    expect(await unknown?.text()).toBe("Upload not found");
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
