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
import type { ActionEvent, CardElement, StateAdapter } from "chat";
import { z } from "zod";

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
  state?: StateAdapter;
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
  actions: Array<{
    actionIds: string[] | string;
    handler: (event: MockActionEvent) => Promise<void>;
  }>;
}

class MockChatSdk {
  static instances: MockChatSdk[] = [];
  readonly config: MockChatSdkConfig;
  readonly handlers: RegisteredHandlers = {
    directMessages: [],
    mentions: [],
    messagePatterns: [],
    subscribedMessages: [],
    actions: [],
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

  onAction(
    actionIds: string[] | string,
    handler: (event: MockActionEvent) => Promise<void>,
  ): void {
    this.handlers.actions.push({ actionIds, handler });
  }
}

void mock.module("chat", () => ({
  Chat: MockChatSdk,
  Card: (options = {}): Record<string, unknown> => ({
    type: "card",
    children: [],
    ...options,
  }),
  Text: (content: string, options = {}): Record<string, unknown> => ({
    type: "text",
    content,
    ...options,
  }),
  Actions: (children: unknown[]): Record<string, unknown> => ({
    type: "actions",
    children,
  }),
  Button: (options: Record<string, unknown>): Record<string, unknown> => ({
    type: "button",
    ...options,
  }),
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
  edit: Mock<(newContent: unknown) => Promise<MockSentMessage>>;
}

type MockPostMessage =
  | string
  | {
      markdown: string;
      files?: Array<{
        filename: string;
        mimeType?: string;
        data: ArrayBuffer | Buffer | Blob;
      }>;
    }
  | {
      card: CardElement;
      fallbackText?: string;
      files?: Array<{
        filename: string;
        mimeType?: string;
        data: ArrayBuffer | Buffer | Blob;
      }>;
    };

const jobProcessingPostSchema = z
  .object({
    fallbackText: z
      .string()
      .refine((value) => value.startsWith("Job processing")),
  })
  .passthrough();

function isJobProcessingPost(message: MockPostMessage): boolean {
  return jobProcessingPostSchema.safeParse(message).success;
}

const cardActionButtonSchema = z
  .object({
    type: z.string(),
    id: z.string().optional(),
    label: z.string().optional(),
    url: z.string().optional(),
    value: z.string().optional(),
  })
  .passthrough();

const cardPostSchema = z.object({
  card: z.object({
    title: z.string().optional(),
    children: z.array(
      z
        .object({
          type: z.string(),
          children: z.array(cardActionButtonSchema).optional(),
        })
        .passthrough(),
    ),
  }),
});

const promptActionPostSchema = cardPostSchema;

type CardActionButton = z.infer<typeof cardActionButtonSchema>;

function getCardActionButtons(
  thread: MockThread,
  title: string,
): CardActionButton[] {
  for (const [message] of thread.post.mock.calls) {
    const parsed = cardPostSchema.safeParse(message);
    if (!parsed.success || parsed.data.card.title !== title) continue;
    return parsed.data.card.children.flatMap((child) =>
      child.type === "actions" ? (child.children ?? []) : [],
    );
  }
  throw new Error(`Card not found: ${title}`);
}

function getPromptActionTokens(thread: MockThread): string[] {
  const tokens: string[] = [];
  for (const [message] of thread.post.mock.calls) {
    const parsed = promptActionPostSchema.safeParse(message);
    if (!parsed.success) continue;
    for (const child of parsed.data.card.children) {
      for (const button of child.children ?? []) {
        if (
          button.type === "button" &&
          button.id === "chat.prompt" &&
          button.value
        ) {
          tokens.push(button.value);
        }
      }
    }
  }
  return tokens;
}

function getFirstPromptActionToken(thread: MockThread): string {
  const [token] = getPromptActionTokens(thread);
  if (token) return token;
  throw new Error("Prompt action token not found");
}

interface MockThread {
  id: string;
  channelId: string;
  isDM: boolean;
  adapter: { name: string };
  subscribe: Mock<() => Promise<void>>;
  post: Mock<(message: MockPostMessage) => Promise<MockSentMessage>>;
  startTyping: Mock<() => Promise<void>>;
}

interface MockActionEvent extends Omit<
  ActionEvent,
  "thread" | "adapter" | "openModal"
> {
  adapter: { name: string };
  thread: MockThread | null;
  openModal: ActionEvent["openModal"];
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
    edit: mock((_newContent: unknown) => Promise.resolve(sentMessage)),
  };
  return sentMessage;
}

function createFetchStub(
  originalFetch: typeof fetch,
  handler: (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => Promise<Response>,
): typeof fetch {
  return Object.assign(handler, { preconnect: originalFetch.preconnect });
}

function createThread(overrides: Partial<MockThread> = {}): MockThread {
  return {
    id: "discord:guild-123:channel-123:thread-456",
    channelId: "discord:guild-123:channel-123",
    isDM: false,
    adapter: { name: "discord" },
    subscribe: mock(() => Promise.resolve()),
    post: mock((_message: MockPostMessage) =>
      Promise.resolve(createSentMessage()),
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

function expectDiscordConfirmationContext(
  userPermissionLevel: "anchor" | "trusted" | "public" = "public",
): unknown {
  return expect.objectContaining({
    channelId: "discord:guild-123:channel-123:thread-456",
    channelName: "discord:guild-123:channel-123",
    interfaceType: "discord",
    userPermissionLevel,
  });
}

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
  let originalFetch: typeof fetch;

  beforeEach(() => {
    MockChatSdk.instances = [];
    createDiscordAdapterMock.mockClear();
    createMemoryStateMock.mockClear();
    originalFetch = globalThis.fetch;
    globalThis.fetch = createFetchStub(originalFetch, (_input, _init) =>
      Promise.resolve(new Response("{}")),
    );
    agentService = createAgentService();
    harness = createPluginHarness<ChatInterfaceInstance>();
    harness.setAgentService(agentService);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    harness.reset();
  });

  it("creates a Chat SDK app with Discord adapter credentials and subscription state", async () => {
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
    const state = MockChatSdk.instances[0]?.config.state;
    expect(state).toBeDefined();
    if (!state) throw new Error("Expected Chat SDK state adapter");
    await state.subscribe("discord:guild-123:channel-123:thread-456");
    expect(
      await state.isSubscribed("discord:guild-123:channel-123:thread-456"),
    ).toBe(true);
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

  it("does not subscribe mentions that occur inside existing Discord threads", async () => {
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
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
    expect(agentService.chat).toHaveBeenCalledWith(
      "Hello bot",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({ interfaceType: "discord" }),
    );
    expect(thread.post).toHaveBeenCalledWith("Agent response text.");
  });

  it("ignores subscribed Discord thread messages that were not subscribed by this interface", async () => {
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ isMention: false, text: "unmentioned follow-up" }),
    );

    expect(agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("routes Discord mentions even when thread subscription fails", async () => {
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      subscribe: mock(() => Promise.reject(new Error("Missing permissions"))),
    });

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.subscribe).toHaveBeenCalledTimes(1);
    expect(agentService.chat).toHaveBeenCalledWith(
      "Hello bot",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({ interfaceType: "discord" }),
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

    expect(thread.subscribe).not.toHaveBeenCalled();

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

  it("ignores messages authored by itself even when mentioned", async () => {
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
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

  it("does not passively capture URLs from messages authored by itself", async () => {
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
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

  it("downloads trusted Discord gateway attachments from URL-only metadata", async () => {
    harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const pdf = Buffer.from("%PDF-1.7 live attachment");
    const originalFetch = globalThis.fetch;
    const fetchMock = mock((_url: string) =>
      Promise.resolve(new Response(pdf, { status: 200 })),
    );
    globalThis.fetch = createFetchStub(originalFetch, (input) =>
      fetchMock(String(input)),
    );

    try {
      await chat?.handlers.mentions[0]?.(
        createThread(),
        createMessage({
          text: "Can you summarize this PDF?",
          attachments: [
            {
              name: "distributed-systems-primer.pdf",
              mimeType: "application/pdf",
              size: pdf.byteLength,
              url: "https://cdn.discordapp.com/attachments/file.pdf",
            },
          ],
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(fetchMock).toHaveBeenCalledWith(
      "https://cdn.discordapp.com/attachments/file.pdf",
    );
    expect(agentService.chat.mock.calls[0]?.[0]).toBe(
      "Can you summarize this PDF?",
    );
    expect(agentService.chat.mock.calls[0]?.[2]?.attachments).toEqual([
      {
        kind: "file",
        filename: "distributed-systems-primer.pdf",
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

  it("reuses trusted uploads on follow-up requests after agent chat fails", async () => {
    harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    agentService.chat
      .mockRejectedValueOnce(new Error("model unavailable"))
      .mockResolvedValueOnce({
        text: "Described upload.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9]);

    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "remember this image",
        attachments: [
          {
            name: "failed-turn-robot.png",
            mimeType: "image/png",
            size: image.byteLength,
            fetchData: mock(() => Promise.resolve(image)),
          },
        ],
      }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        text: "describe that image",
        isMention: false,
      }),
    );

    expect(agentService.chat).toHaveBeenCalledTimes(2);
    expect(agentService.chat.mock.calls[1]?.[2]?.attachments).toEqual([
      expect.objectContaining({
        kind: "file",
        filename: "failed-turn-robot.png",
        mediaType: "image/png",
        data: image,
      }),
    ]);
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

  it("posts single pending approvals as concise SDK cards with yes/no fallback", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "tool-approval",
          id: "approval-card-1",
          toolName: "system_delete",
          summary: "Delete thing",
          preview: "This will delete the thing.",
          state: "approval-requested",
          input: { entityId: "thing-1" },
        },
      ],
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
    expect(thread.post).toHaveBeenNthCalledWith(1, "Please confirm.");
    expect(thread.post.mock.calls[0]?.[0]).not.toContain("Approval:");
    expect(thread.post.mock.calls[0]?.[0]).not.toContain("approval-requested");
    expect(thread.post).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fallbackText:
          "Approval required: Delete thing\nReply yes to confirm or no/cancel to abort.",
        card: expect.objectContaining({
          type: "card",
          title: "Approval required",
          children: expect.arrayContaining([
            expect.objectContaining({ type: "text", content: "Delete thing" }),
            expect.objectContaining({
              type: "actions",
              children: expect.arrayContaining([
                expect.objectContaining({
                  type: "button",
                  id: "approval.confirm",
                  label: "Confirm",
                  value: "approval-1",
                }),
                expect.objectContaining({
                  type: "button",
                  id: "approval.cancel",
                  label: "Cancel",
                  value: "approval-1",
                }),
              ]),
            }),
          ]),
        }),
      }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", isMention: false }),
    );

    expect(agentService.confirmPendingAction).toHaveBeenCalledWith(
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-1",
      expectDiscordConfirmationContext(),
    );
    expect(thread.post).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fallbackText: "Approved · Action confirmed.",
        card: expect.objectContaining({ title: "Approval confirmed" }),
      }),
    );
  });

  it("resolves approval cards in the matching conversation when approval ids collide", async () => {
    agentService.chat
      .mockResolvedValueOnce({
        text: "Please confirm first.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        pendingConfirmations: [
          {
            id: "approval-1",
            toolName: "system_delete",
            summary: "Delete first thing",
            args: {},
          },
        ],
      })
      .mockResolvedValueOnce({
        text: "Please confirm second.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        pendingConfirmations: [
          {
            id: "approval-1",
            toolName: "system_delete",
            summary: "Delete second thing",
            args: {},
          },
        ],
      });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const firstApprovalMessage = createSentMessage("first-approval-message");
    const secondApprovalMessage = createSentMessage("second-approval-message");
    let firstPostCount = 0;
    let secondPostCount = 0;
    const firstThread = createThread({
      post: mock((_message: MockPostMessage) => {
        firstPostCount += 1;
        return Promise.resolve(
          firstPostCount === 2 ? firstApprovalMessage : createSentMessage(),
        );
      }),
    });
    const secondThread = createThread({
      id: "discord:guild-123:channel-999:thread-999",
      channelId: "discord:guild-123:channel-999",
      post: mock((_message: MockPostMessage) => {
        secondPostCount += 1;
        return Promise.resolve(
          secondPostCount === 2 ? secondApprovalMessage : createSentMessage(),
        );
      }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = createFetchStub(originalFetch, () =>
      Promise.resolve(new Response("{}")),
    );

    try {
      await chat?.handlers.mentions[0]?.(firstThread, createMessage());
      await chat?.handlers.mentions[0]?.(
        secondThread,
        createMessage({
          threadId: "discord:guild-123:channel-999:thread-999",
          raw: { guild_id: "guild-123", channel_id: "channel-999" },
        }),
      );
      await chat?.handlers.subscribedMessages[0]?.(
        firstThread,
        createMessage({ text: "yes", isMention: false }),
      );

      expect(firstApprovalMessage.edit).toHaveBeenCalledWith(
        expect.objectContaining({
          fallbackText: "Approval confirmed: Delete first thing",
        }),
      );
      expect(secondApprovalMessage.edit).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("confirms pending approvals from SDK card buttons and removes the buttons", async () => {
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
    const approvalMessage = createSentMessage("approval-message-1");
    const resultMessage = createSentMessage("result-message-1");
    let postCount = 0;
    const thread = createThread({
      post: mock((_message: MockPostMessage) => {
        postCount += 1;
        return Promise.resolve(
          postCount === 2 ? approvalMessage : resultMessage,
        );
      }),
    });
    const originalFetch = globalThis.fetch;
    const fetchMock = mock((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response("{}")),
    );
    globalThis.fetch = createFetchStub(originalFetch, (input, init) =>
      fetchMock(String(input), init ?? undefined),
    );

    try {
      await chat?.handlers.mentions[0]?.(thread, createMessage());
      await chat?.handlers.actions[0]?.handler({
        actionId: "approval.confirm",
        adapter: { name: "discord" },
        messageId: "approval-message-1",
        openModal: mock(() => Promise.resolve(undefined)),
        raw: {},
        thread,
        threadId: thread.id,
        user: {
          userId: "user-789",
          userName: "mira",
          fullName: "Mira Ops",
          isBot: false,
          isMe: false,
        },
        value: "approval-1",
      } as MockActionEvent);

      expect(agentService.confirmPendingAction).toHaveBeenCalledWith(
        "discord-discord:guild-123:channel-123:thread-456",
        true,
        "approval-1",
        expect.objectContaining({
          channelId: "discord:guild-123:channel-123:thread-456",
          channelName: "discord:guild-123:channel-123",
          interfaceType: "discord",
          userPermissionLevel: "public",
          actor: expect.objectContaining({
            actorId: "discord:user-789",
            displayName: "Mira Ops",
            username: "mira",
          }),
          source: expect.objectContaining({
            messageId: "approval-message-1",
            channelId: "discord:guild-123:channel-123:thread-456",
            threadId: "thread-456",
            metadata: expect.objectContaining({
              actionId: "approval.confirm",
              actionValue: "approval-1",
              guildId: "guild-123",
            }),
          }),
        }),
      );
      expect(approvalMessage.edit).toHaveBeenCalledWith(
        expect.objectContaining({
          fallbackText: "Approval confirmed: Delete thing",
          card: expect.objectContaining({
            type: "card",
            title: "Approval confirmed",
            children: expect.not.arrayContaining([
              expect.objectContaining({ type: "actions" }),
            ]),
          }),
        }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "https://discord.com/api/v10/channels/thread-456/messages/approval-message-1",
        expect.objectContaining({
          method: "PATCH",
          headers: expect.objectContaining({
            Authorization: "Bot discord-token",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ components: [] }),
        }),
      );
      expect(thread.post).toHaveBeenLastCalledWith(
        expect.objectContaining({
          fallbackText: "Approved · Action confirmed.",
          card: expect.objectContaining({ title: "Approval confirmed" }),
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not confirm approval button actions when Discord DMs are disabled", async () => {
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
    const plugin = createPlugin({ allowDMs: false });
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    thread.isDM = true;
    await chat?.handlers.actions[0]?.handler({
      actionId: "approval.confirm",
      adapter: { name: "discord" },
      messageId: "approval-message-1",
      openModal: mock(() => Promise.resolve(undefined)),
      raw: {},
      thread,
      threadId: thread.id,
      user: {
        userId: "user-789",
        userName: "mira",
        fullName: "Mira Ops",
        isBot: false,
        isMe: false,
      },
      value: "approval-1",
    } as MockActionEvent);

    expect(agentService.confirmPendingAction).not.toHaveBeenCalled();
  });

  it("continues chained pending confirmations returned by a confirmed action", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "system_delete",
          summary: "Delete first thing",
          args: {},
        },
      ],
    });
    agentService.confirmPendingAction.mockResolvedValueOnce({
      text: "First action confirmed.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-2",
          toolName: "system_delete",
          summary: "Delete second thing",
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
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", isMention: false }),
    );

    expect(agentService.confirmPendingAction).toHaveBeenNthCalledWith(
      1,
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-1",
      expectDiscordConfirmationContext(),
    );
    expect(agentService.confirmPendingAction).toHaveBeenNthCalledWith(
      2,
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-2",
      expectDiscordConfirmationContext(),
    );
    expect(thread.post).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        fallbackText: "Approved · First action confirmed.",
        card: expect.objectContaining({ title: "Approval confirmed" }),
      }),
    );
    expect(thread.post).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        fallbackText:
          "Approval required: Delete second thing\nReply yes to confirm or no/cancel to abort.",
        card: expect.objectContaining({
          type: "card",
          title: "Approval required",
        }),
      }),
    );
  });

  it("syncs pending confirmations returned by a confirmed action", async () => {
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
    agentService.confirmPendingAction.mockResolvedValueOnce({
      text: "First action confirmed.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
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
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes approval-1", isMention: false }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes approval-1", isMention: false }),
    );

    expect(agentService.confirmPendingAction).toHaveBeenCalledTimes(1);
    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "No matching pending approval id. Pending approval ids: approval-2.",
        card: expect.objectContaining({ title: "Approval notice" }),
      }),
    );
  });

  it("does not re-add a resolved approval returned by a stale response", async () => {
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
      ],
    });
    agentService.confirmPendingAction.mockResolvedValueOnce({
      text: "Action confirmed.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "system_publish",
          summary: "Publish one",
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
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", isMention: false }),
    );

    expect(agentService.confirmPendingAction).toHaveBeenCalledTimes(1);
    expect(agentService.chat).toHaveBeenCalledTimes(2);
    expect(agentService.chat.mock.calls[1]?.[0]).toBe("yes");
  });

  it("clears pending confirmations when confirmed action returns an empty pending list", async () => {
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
    agentService.confirmPendingAction.mockResolvedValueOnce({
      text: "All actions resolved.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [],
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes approval-1", isMention: false }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes approval-2", isMention: false }),
    );

    expect(agentService.confirmPendingAction).toHaveBeenCalledTimes(1);
    expect(agentService.chat).toHaveBeenCalledTimes(2);
    expect(agentService.chat.mock.calls[1]?.[0]).toBe("yes approval-2");
  });

  it("keeps pending confirmations open when confirmation handling throws", async () => {
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
    agentService.confirmPendingAction.mockRejectedValueOnce(
      new Error("Temporary approval failure"),
    );
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", isMention: false }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", isMention: false }),
    );

    expect(agentService.confirmPendingAction).toHaveBeenCalledTimes(2);
    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Message failed: Temporary approval failure",
        card: expect.objectContaining({ title: "Message failed" }),
      }),
    );
    expect(thread.post).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fallbackText: "Approved · Action confirmed.",
        card: expect.objectContaining({ title: "Approval confirmed" }),
      }),
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
      expectDiscordConfirmationContext(),
    );
    expect(thread.post).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fallbackText: "Declined",
        card: expect.objectContaining({ title: "Approval declined" }),
      }),
    );
  });

  it("posts native Discord files for trusted artifacts returned by confirmations", async () => {
    harness.addEntities([
      {
        id: "confirmed-deck",
        entityType: "document",
        content: `data:application/pdf;base64,${Buffer.from("%PDF confirmed").toString("base64")}`,
        metadata: { filename: "confirmed-deck.pdf" },
        visibility: "shared",
      },
    ]);
    harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    agentService.chat.mockResolvedValueOnce({
      text: "Approval required.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "generate_deck",
          summary: "Generate deck",
          args: {},
        },
      ],
    });
    agentService.confirmPendingAction.mockResolvedValueOnce({
      text: "Deck generated.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Confirmed deck",
          attachment: {
            mediaType: "application/pdf",
            url: "/api/chat/attachments/document?id=confirmed-deck",
            filename: "confirmed-deck.pdf",
            source: { entityType: "document", entityId: "confirmed-deck" },
          },
        },
      ],
    });
    const thread = createThread();
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.mentions[0]?.(thread, createMessage({ text: "yes" }));

    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [
          expect.objectContaining({
            filename: "confirmed-deck.pdf",
            mimeType: "application/pdf",
          }),
        ],
      }),
    );
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
      expect.objectContaining({
        fallbackText: "Delete failed · Entity not found: base/woodchuck-note",
        card: expect.objectContaining({ title: "Action failed" }),
      }),
    );
    expect(JSON.stringify(thread.post.mock.calls.at(-1)?.[0])).not.toContain(
      '"success"',
    );
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
      expect.objectContaining({
        fallbackText: "Please reply with yes to confirm or no/cancel to abort.",
        card: expect.objectContaining({ title: "Approval notice" }),
      }),
    );
    expect(agentService.confirmPendingAction).toHaveBeenCalledTimes(1);
    expect(agentService.confirmPendingAction).toHaveBeenCalledWith(
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-1",
      expectDiscordConfirmationContext(),
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
    expect(thread.post).toHaveBeenCalledWith("Please confirm.");
    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "Approvals pending:\napproval-1: Publish one\napproval-2: Publish two\nReply yes <approval-id> to confirm one item, or no <approval-id> to abort it.",
        card: expect.objectContaining({ title: "Approvals pending" }),
      }),
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
      expect.objectContaining({
        fallbackText:
          "Multiple approvals are pending; include one approval id with yes or no/cancel: approval-1, approval-2.",
        card: expect.objectContaining({ title: "Approval notice" }),
      }),
    );
    expect(agentService.confirmPendingAction).toHaveBeenCalledWith(
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-2",
      expectDiscordConfirmationContext(),
    );
  });

  it("keeps remaining approvals pending after approving one of many", async () => {
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
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes approval-1", isMention: false }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes approval-2", isMention: false }),
    );

    expect(agentService.confirmPendingAction).toHaveBeenNthCalledWith(
      1,
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-1",
      expectDiscordConfirmationContext(),
    );
    expect(agentService.confirmPendingAction).toHaveBeenNthCalledWith(
      2,
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-2",
      expectDiscordConfirmationContext(),
    );
    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "Approved · Action confirmed.\n\nRemaining pending approval ids: `approval-2`.",
        card: expect.objectContaining({ title: "Approval confirmed" }),
      }),
    );
  });

  it("keeps remaining approvals pending after cancelling one of many", async () => {
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
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "no approval-1", isMention: false }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes approval-2", isMention: false }),
    );

    expect(agentService.confirmPendingAction).toHaveBeenNthCalledWith(
      1,
      "discord-discord:guild-123:channel-123:thread-456",
      false,
      "approval-1",
      expectDiscordConfirmationContext(),
    );
    expect(agentService.confirmPendingAction).toHaveBeenNthCalledWith(
      2,
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-2",
      expectDiscordConfirmationContext(),
    );
    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "Declined\n\nRemaining pending approval ids: `approval-2`.",
        card: expect.objectContaining({ title: "Approval declined" }),
      }),
    );
  });

  it("selects the exact colon approval id when ids share a prefix", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval:call-1",
          toolName: "system_publish",
          summary: "Publish one",
          args: {},
        },
        {
          id: "approval:call-10",
          toolName: "system_publish",
          summary: "Publish ten",
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
      createMessage({ text: "yes approval:call-10", isMention: false }),
    );

    expect(agentService.confirmPendingAction).toHaveBeenCalledWith(
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval:call-10",
      expectDiscordConfirmationContext(),
    );
  });

  it("selects the exact approval id when ids share a prefix", async () => {
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
          id: "approval-10",
          toolName: "system_publish",
          summary: "Publish ten",
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
      createMessage({ text: "yes approval-10", isMention: false }),
    );

    expect(agentService.confirmPendingAction).toHaveBeenCalledWith(
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-10",
      expectDiscordConfirmationContext(),
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
      expectDiscordConfirmationContext(),
    );
  });

  it("sends an error message when agent chat fails", async () => {
    agentService.chat.mockRejectedValueOnce(new Error("Agent failed"));
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Message failed: Agent failed",
        card: expect.objectContaining({ title: "Message failed" }),
      }),
    );
  });

  it("posts structured artifact cards as SDK cards with concise fallback text", async () => {
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

    expect(thread.post).toHaveBeenNthCalledWith(1, "Generated the deck.");
    expect(thread.post).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fallbackText:
          "Artifact: Deck carousel\nReady to review.\nFile: deck-carousel.pdf\nType: application/pdf\nSize: 1.2 KB",
        card: expect.objectContaining({
          type: "card",
          title: "Deck carousel",
          children: expect.arrayContaining([
            expect.objectContaining({
              type: "text",
              content: "Ready to review.",
            }),
            expect.objectContaining({
              type: "fields",
              children: expect.arrayContaining([
                expect.objectContaining({
                  type: "field",
                  label: "File",
                  value: "deck-carousel.pdf",
                }),
                expect.objectContaining({
                  type: "field",
                  label: "Type",
                  value: "application/pdf",
                }),
                expect.objectContaining({
                  type: "field",
                  label: "Size",
                  value: "1.2 KB",
                }),
              ]),
            }),
            expect.objectContaining({
              type: "actions",
              children: expect.arrayContaining([
                expect.objectContaining({
                  type: "link-button",
                  label: "Open",
                  url: "https://brain.test/api/chat/attachments/document?id=deck-1",
                }),
                expect.objectContaining({
                  type: "link-button",
                  label: "Download",
                  url: "https://brain.test/api/chat/attachments/document?id=deck-1&download=1",
                }),
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it("posts native Discord files for trusted generated document artifacts", async () => {
    harness.addEntities([
      {
        id: "deck-native",
        entityType: "document",
        content: `data:application/pdf;base64,${Buffer.from("%PDF-1.4 test").toString("base64")}`,
        metadata: { filename: "native-deck.pdf" },
        visibility: "shared",
      },
    ]);
    harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    agentService.chat.mockResolvedValueOnce({
      text: "Generated the deck.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Native deck",
          attachment: {
            mediaType: "application/pdf",
            url: "/api/chat/attachments/document?id=deck-native",
            filename: "native-deck.pdf",
            source: { entityType: "document", entityId: "deck-native" },
          },
        },
      ],
    });
    const sentMessage = createSentMessage();
    const thread = createThread({
      post: mock((_message: MockPostMessage) => Promise.resolve(sentMessage)),
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        markdown: "Generated the deck.",
        files: [
          expect.objectContaining({
            filename: "native-deck.pdf",
            mimeType: "application/pdf",
          }),
        ],
      }),
    );
    expect(thread.post).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fallbackText:
          "Artifact: Native deck\nFile: native-deck.pdf\nType: application/pdf",
        card: expect.objectContaining({
          type: "card",
          title: "Native deck",
        }),
      }),
    );
  });

  it("posts native Discord image files resolved from artifact URLs", async () => {
    harness.addEntities([
      {
        id: "image-native",
        entityType: "image",
        content: `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`,
        metadata: { filename: "native-image.png" },
        visibility: "shared",
      },
    ]);
    harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    agentService.chat.mockResolvedValueOnce({
      text: "Generated the image.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Native image",
          attachment: {
            mediaType: "image/png",
            url: "/api/chat/attachments/image?id=image-native",
            filename: "native-image.png",
          },
        },
      ],
    });
    const thread = createThread();
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [
          expect.objectContaining({
            filename: "native-image.png",
            mimeType: "image/png",
          }),
        ],
      }),
    );
  });

  it("does not post restricted native Discord artifact files for trusted users", async () => {
    harness.addEntities([
      {
        id: "deck-trusted-denied",
        entityType: "document",
        content: `data:application/pdf;base64,${Buffer.from("%PDF-1.4 test").toString("base64")}`,
        metadata: { filename: "trusted-denied-deck.pdf" },
        visibility: "restricted",
      },
    ]);
    harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    agentService.chat.mockResolvedValueOnce({
      text: "Generated the deck.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Trusted denied deck",
          attachment: {
            mediaType: "application/pdf",
            url: "/api/chat/attachments/document?id=deck-trusted-denied",
            filename: "trusted-denied-deck.pdf",
            source: {
              entityType: "document",
              entityId: "deck-trusted-denied",
            },
          },
        },
      ],
    });
    const thread = createThread();
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith(
      [
        "Generated the deck.",
        "Artifact: Not available at your access level.",
      ].join("\n\n"),
    );
  });

  it("does not render relative-only artifact links when the referenced entity does not exist", async () => {
    // A card whose entity is not stored must not be mistaken for an
    // out-of-scope artifact: its link still renders rather than being
    // suppressed as denied.
    harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    agentService.chat.mockResolvedValueOnce({
      text: "Generated the deck.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Missing deck",
          attachment: {
            mediaType: "application/pdf",
            url: "/api/chat/attachments/document?id=deck-missing",
            filename: "missing-deck.pdf",
            source: { entityType: "document", entityId: "deck-missing" },
          },
        },
      ],
    });
    const thread = createThread();
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenNthCalledWith(1, "Generated the deck.");
    expect(thread.post).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fallbackText:
          "Artifact: Missing deck\nFile: missing-deck.pdf\nType: application/pdf",
        card: expect.objectContaining({
          type: "card",
          title: "Missing deck",
          children: expect.not.arrayContaining([
            expect.objectContaining({ type: "actions" }),
          ]),
        }),
      }),
    );
  });

  it("does not post native Discord artifact files for public users", async () => {
    harness.addEntities([
      {
        id: "deck-public-denied",
        entityType: "document",
        content: `data:application/pdf;base64,${Buffer.from("%PDF-1.4 test").toString("base64")}`,
        metadata: { filename: "denied-deck.pdf" },
        visibility: "restricted",
      },
    ]);
    agentService.chat.mockResolvedValueOnce({
      text: "Generated the deck.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Denied deck",
          attachment: {
            mediaType: "application/pdf",
            url: "/api/chat/attachments/document?id=deck-public-denied",
            filename: "denied-deck.pdf",
            source: {
              entityType: "document",
              entityId: "deck-public-denied",
            },
          },
        },
      ],
    });
    const thread = createThread();
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith(
      [
        "Generated the deck.",
        "Artifact: Not available at your access level.",
      ].join("\n\n"),
    );
  });

  it("suppresses shared artifact fallback links for public Discord users", async () => {
    harness.addEntities([
      {
        id: "deck-public-shared-denied",
        entityType: "document",
        content: `data:application/pdf;base64,${Buffer.from("%PDF-1.4 test").toString("base64")}`,
        metadata: { filename: "shared-denied-deck.pdf" },
        visibility: "shared",
      },
    ]);
    agentService.chat.mockResolvedValueOnce({
      text: "Generated the deck.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Shared denied deck",
          attachment: {
            mediaType: "application/pdf",
            url: "/api/chat/attachments/document?id=deck-public-shared-denied",
            downloadUrl:
              "/api/chat/attachments/document?id=deck-public-shared-denied&download=1",
            filename: "shared-denied-deck.pdf",
            source: {
              entityType: "document",
              entityId: "deck-public-shared-denied",
            },
          },
        },
      ],
    });
    const thread = createThread();
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith(
      [
        "Generated the deck.",
        "Artifact: Not available at your access level.",
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

    expect(thread.post).toHaveBeenNthCalledWith(1, "Generated the image.");
    expect(thread.post).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fallbackText: "Artifact: Robot image\nFile: robot.png\nType: image/png",
        card: expect.objectContaining({
          type: "card",
          title: "Robot image",
          children: expect.arrayContaining([
            expect.objectContaining({
              type: "actions",
              children: expect.arrayContaining([
                expect.objectContaining({
                  type: "link-button",
                  label: "Preview",
                  url: "https://brain.test/api/chat/attachments/image?id=robot-1&preview=1",
                }),
                expect.objectContaining({
                  type: "link-button",
                  label: "Open",
                  url: "https://brain.test/api/chat/attachments/image?id=robot-1",
                }),
                expect.objectContaining({
                  type: "link-button",
                  label: "Download",
                  url: "https://brain.test/api/chat/attachments/image?id=robot-1&download=1",
                }),
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it("does not expose localhost artifact links in Discord summaries", async () => {
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

    expect(thread.post).toHaveBeenNthCalledWith(1, "Generated local preview.");
    expect(thread.post).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fallbackText: "Artifact: Local robot\nFile: robot.png\nType: image/png",
        card: expect.objectContaining({
          type: "card",
          title: "Local robot",
          children: expect.not.arrayContaining([
            expect.objectContaining({ type: "actions" }),
          ]),
        }),
      }),
    );
    expect(JSON.stringify(thread.post.mock.calls)).not.toContain("localhost");
  });

  it("posts source and action cards as supplemental SDK cards", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "Here are the next steps.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "sources",
          id: "sources-1",
          title: "References",
          sources: [
            {
              id: "source-1",
              title: "Launch Plan",
              source: "document",
              url: "https://example.com/launch",
            },
            {
              id: "source-2",
              title: "Local Draft",
              source: "document",
              url: "http://localhost:3000/documents/local-draft",
            },
          ],
        },
        {
          kind: "actions",
          id: "actions-1",
          title: "Next actions",
          actions: [
            {
              type: "prompt",
              id: "action-1",
              label: "Draft announcement",
              prompt: "Draft an announcement",
              description: "Prepare launch copy",
            },
          ],
        },
      ],
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith("Here are the next steps.");
    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "Sources: References\n- Launch Plan — https://example.com/launch\n- Local Draft",
        card: expect.objectContaining({
          title: "References",
          children: expect.arrayContaining([
            expect.objectContaining({
              type: "actions",
              children: [
                expect.objectContaining({
                  type: "link-button",
                  label: "Open 1",
                  url: "https://example.com/launch",
                }),
              ],
            }),
          ]),
        }),
      }),
    );
    expect(JSON.stringify(thread.post.mock.calls)).not.toContain("localhost");
    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Actions: Next actions\n- Draft announcement",
        card: expect.objectContaining({
          title: "Next actions",
          children: expect.arrayContaining([
            expect.objectContaining({
              type: "actions",
              children: [
                expect.objectContaining({
                  type: "button",
                  id: "chat.prompt",
                  label: "Draft announcement",
                  value: expect.stringMatching(/^action_/),
                }),
              ],
            }),
          ]),
        }),
      }),
    );
  });

  it("caps Discord source and action card buttons to component limits", async () => {
    const longLabel = `Draft ${"launch ".repeat(20)}`;
    agentService.chat.mockResolvedValueOnce({
      text: "Many options.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "sources",
          id: "sources-many",
          title: "Many references",
          sources: Array.from({ length: 30 }, (_, index) => ({
            id: `source-${index + 1}`,
            title: `Source ${index + 1}`,
            source: "document",
            url: `https://example.com/source-${index + 1}`,
          })),
        },
        {
          kind: "actions",
          id: "actions-many",
          title: "Many actions",
          actions: Array.from({ length: 30 }, (_, index) => ({
            type: "prompt" as const,
            id: `action-${index + 1}`,
            label: index === 0 ? longLabel : `Action ${index + 1}`,
            prompt: `Run action ${index + 1}`,
          })),
        },
      ],
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    const sourceButtons = getCardActionButtons(thread, "Many references");
    expect(sourceButtons).toHaveLength(25);
    expect(sourceButtons.at(-1)).toEqual(
      expect.objectContaining({
        type: "link-button",
        label: "Open 25",
        url: "https://example.com/source-25",
      }),
    );
    const actionButtons = getCardActionButtons(thread, "Many actions");
    expect(actionButtons).toHaveLength(25);
    expect(getPromptActionTokens(thread)).toHaveLength(25);
    expect(actionButtons[0]?.label).toHaveLength(80);
    expect(actionButtons[0]?.label?.endsWith("…")).toBe(true);
    expect(actionButtons.at(-1)).toEqual(
      expect.objectContaining({
        type: "button",
        id: "chat.prompt",
        label: "Action 25",
      }),
    );
  });

  it("keeps reused suggested prompt action ids routed to their original prompts", async () => {
    agentService.chat
      .mockResolvedValueOnce({
        text: "First card.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        cards: [
          {
            kind: "actions",
            id: "actions-1",
            title: "First actions",
            actions: [
              {
                type: "prompt",
                id: "action-1",
                label: "Draft first",
                prompt: "Draft first announcement",
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        text: "Second card.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        cards: [
          {
            kind: "actions",
            id: "actions-2",
            title: "Second actions",
            actions: [
              {
                type: "prompt",
                id: "action-1",
                label: "Draft second",
                prompt: "Draft second announcement",
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        text: "Drafted first.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    const firstToken = getFirstPromptActionToken(thread);
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "more options", isMention: false }),
    );
    const tokens = getPromptActionTokens(thread);
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toBe(firstToken);
    expect(tokens[1]).toMatch(/^action_/);
    expect(tokens[1]).not.toBe(firstToken);

    const promptActionHandler = chat?.handlers.actions.find(
      ({ actionIds }) => actionIds === "chat.prompt",
    )?.handler;
    await promptActionHandler?.({
      actionId: "chat.prompt",
      adapter: { name: "discord" },
      messageId: "first-actions-message",
      openModal: mock(() => Promise.resolve(undefined)),
      raw: {},
      thread,
      threadId: thread.id,
      user: {
        userId: "user-789",
        userName: "mira",
        fullName: "Mira Ops",
        isBot: false,
        isMe: false,
      },
      value: firstToken,
    } as MockActionEvent);

    expect(agentService.chat).toHaveBeenNthCalledWith(
      3,
      "Draft first announcement",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({ interfaceType: "discord" }),
    );
  });

  it("routes suggested prompt action buttons to the agent", async () => {
    agentService.chat
      .mockResolvedValueOnce({
        text: "Pick one.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        cards: [
          {
            kind: "actions",
            id: "actions-1",
            title: "Next actions",
            actions: [
              {
                type: "prompt",
                id: "action-1",
                label: "Draft announcement",
                prompt: "Draft an announcement",
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        text: "Drafted announcement.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    const actionToken = getFirstPromptActionToken(thread);
    expect(actionToken).toMatch(/^action_/);
    expect(actionToken).not.toBe("action-1");
    const promptActionHandler = chat?.handlers.actions.find(
      ({ actionIds }) => actionIds === "chat.prompt",
    )?.handler;
    await promptActionHandler?.({
      actionId: "chat.prompt",
      adapter: { name: "discord" },
      messageId: "actions-message-1",
      openModal: mock(() => Promise.resolve(undefined)),
      raw: {},
      thread,
      threadId: thread.id,
      user: {
        userId: "user-789",
        userName: "mira",
        fullName: "Mira Ops",
        isBot: false,
        isMe: false,
      },
      value: actionToken,
    } as MockActionEvent);

    expect(agentService.chat).toHaveBeenNthCalledWith(
      2,
      "Draft an announcement",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({
        interfaceType: "discord",
        channelId: "discord:guild-123:channel-123:thread-456",
        actor: expect.objectContaining({
          actorId: "discord:user-789",
          displayName: "Mira Ops",
          username: "mira",
        }),
        source: expect.objectContaining({
          messageId: "actions-message-1",
          channelId: "discord:guild-123:channel-123:thread-456",
          threadId: "thread-456",
          metadata: expect.objectContaining({
            actionId: "chat.prompt",
            actionValue: actionToken,
            guildId: "guild-123",
          }),
        }),
      }),
    );
    expect(thread.startTyping).toHaveBeenCalledTimes(2);
    expect(thread.post).toHaveBeenLastCalledWith("Drafted announcement.");
  });

  it("does not route suggested prompt actions when Discord DMs are disabled", async () => {
    agentService.chat
      .mockResolvedValueOnce({
        text: "Pick one.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        cards: [
          {
            kind: "actions",
            id: "actions-1",
            title: "Next actions",
            actions: [
              {
                type: "prompt",
                id: "action-1",
                label: "Draft announcement",
                prompt: "Draft an announcement",
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        text: "Should not run.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      });
    const plugin = createPlugin({ allowDMs: false });
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    const actionToken = getFirstPromptActionToken(thread);
    thread.isDM = true;
    const promptActionHandler = chat?.handlers.actions.find(
      ({ actionIds }) => actionIds === "chat.prompt",
    )?.handler;
    await promptActionHandler?.({
      actionId: "chat.prompt",
      adapter: { name: "discord" },
      messageId: "actions-message-1",
      openModal: mock(() => Promise.resolve(undefined)),
      raw: {},
      thread,
      threadId: thread.id,
      user: {
        userId: "user-789",
        userName: "mira",
        fullName: "Mira Ops",
        isBot: false,
        isMe: false,
      },
      value: actionToken,
    } as MockActionEvent);

    expect(agentService.chat).toHaveBeenCalledTimes(1);
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

    expect(thread.post).toHaveBeenCalledWith("Approval needed.");
    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "Approval: Publish Launch Post\nStatus: approval-requested\nThis will publish the draft post.",
        card: expect.objectContaining({ title: "Approval required" }),
      }),
    );
    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Approval: Publish Follow-up\nStatus: output-available",
        card: expect.objectContaining({ title: "Approval status" }),
      }),
    );
    expect(JSON.stringify(thread.post.mock.calls)).not.toContain("internal");
  });

  it("edits Discord tool activity status messages after the agent response", async () => {
    const statusMessage = createSentMessage("status-1");
    const responseMessage = createSentMessage("response-1");
    let postCount = 0;
    const thread = createThread({
      post: mock((_message: MockPostMessage) => {
        postCount += 1;
        return Promise.resolve(
          postCount === 1 ? statusMessage : responseMessage,
        );
      }),
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const toolInterface = plugin as unknown as ChatInterfaceWithToolActivity;
    agentService.chat.mockImplementationOnce(
      async (_message, conversationId) => {
        await toolInterface.handleToolActivityEvent({
          type: "tool:invoking",
          toolName: "system_publish",
          conversationId,
          interfaceType: "discord",
          channelId: thread.id,
        });
        await toolInterface.handleToolActivityEvent({
          type: "tool:completed",
          toolName: "system_publish",
          conversationId,
          interfaceType: "discord",
          channelId: thread.id,
        });
        expect(statusMessage.edit).not.toHaveBeenCalledWith(
          expect.objectContaining({
            fallbackText: "Tool completed: system publish",
          }),
        );
        return {
          text: "Agent response text.",
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        };
      },
    );

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Tool running: system publish",
        card: expect.objectContaining({ title: "Tool running" }),
      }),
    );
    expect(statusMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Tool completed: system publish",
        card: expect.objectContaining({ title: "Tool completed" }),
      }),
    );
  });

  it("does not mark approval-requested tools as completed before confirmation", async () => {
    const statusMessage = createSentMessage("status-1");
    const responseMessage = createSentMessage("response-1");
    let postCount = 0;
    const thread = createThread({
      post: mock((_message: MockPostMessage) => {
        postCount += 1;
        return Promise.resolve(
          postCount === 1 ? statusMessage : responseMessage,
        );
      }),
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const toolInterface = plugin as unknown as ChatInterfaceWithToolActivity;
    agentService.chat.mockImplementationOnce(
      async (_message, conversationId) => {
        await toolInterface.handleToolActivityEvent({
          type: "tool:invoking",
          toolName: "system_create",
          conversationId,
          interfaceType: "discord",
          channelId: thread.id,
        });
        await toolInterface.handleToolActivityEvent({
          type: "tool:completed",
          toolName: "system_create",
          conversationId,
          interfaceType: "discord",
          channelId: thread.id,
        });
        return {
          text: "Confirmation required.",
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
          pendingConfirmations: [
            {
              id: "approval-1",
              toolName: "system_create",
              summary: "Generate image?",
              args: {},
            },
          ],
        };
      },
    );

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(statusMessage.edit).not.toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Tool completed: system create",
      }),
    );
    expect(statusMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Tool awaiting approval: system create",
        card: expect.objectContaining({ title: "Approval required" }),
      }),
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
      expect.objectContaining({
        fallbackText: "Tool failed: system publish: Publish failed",
        card: expect.objectContaining({ title: "Tool failed" }),
      }),
    );
  });

  it("ignores non-Discord progress events even when a Discord thread is tracked", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "Queued build.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      toolResults: [{ toolName: "site_build", jobId: "job-123" }],
    });
    const sentMessage = createSentMessage();
    const thread = createThread({
      post: mock((_message: MockPostMessage) => Promise.resolve(sentMessage)),
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    thread.post.mockClear();
    await harness.sendMessage("job-progress", {
      id: "job-123",
      type: "job",
      status: "completed",
      message: "Web chat job done",
      metadata: {
        rootJobId: "job-123",
        operationType: "content_operations",
        operationTarget: "Site",
        interfaceType: "web-chat",
        channelId: thread.id,
      },
    });

    expect(sentMessage.edit).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("edits tracked Discord agent responses for async job progress", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "Queued build.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      toolResults: [{ toolName: "site_build", jobId: "job-123" }],
    });
    const sentMessage = createSentMessage();
    const thread = createThread({
      post: mock((_message: MockPostMessage) => Promise.resolve(sentMessage)),
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
      expect.objectContaining({
        fallbackText:
          "Job processing: content operations: Site 2/4 (50%)\nBuilding routes",
        card: expect.objectContaining({ title: "Job processing" }),
      }),
    );
  });

  it("tracks Discord artifact card jobs for async progress", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "Queued export.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          jobId: "artifact-job-123",
          title: "Deck export",
          attachment: {
            mediaType: "application/pdf",
            url: "/api/chat/attachments/document?id=deck-1",
            filename: "deck.pdf",
          },
        },
      ],
    });
    const sentMessage = createSentMessage();
    const thread = createThread({
      post: mock((_message: MockPostMessage) => Promise.resolve(sentMessage)),
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await new Promise((resolve) => setTimeout(resolve, 510));
    await harness.sendMessage("job-progress", {
      id: "artifact-job-123",
      type: "job",
      status: "processing",
      message: "Rendering deck",
      progress: { current: 1, total: 2, percentage: 50 },
      metadata: {
        rootJobId: "artifact-job-123",
        operationType: "content_operations",
        operationTarget: "Deck",
        interfaceType: "discord",
        channelId: thread.id,
      },
    });

    expect(sentMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "Job processing: content operations: Deck 1/2 (50%)\nRendering deck",
        card: expect.objectContaining({ title: "Job processing" }),
      }),
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
      post: mock((_message: MockPostMessage) => Promise.resolve(sentMessage)),
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
      expect.objectContaining({
        fallbackText: "Job completed: content operations: Site\nDone",
        card: expect.objectContaining({ title: "Job completed" }),
      }),
    );
  });

  it("posts and edits standalone Discord progress when no agent response is tracked", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "Starting background build.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });
    const agentSentMessage = createSentMessage("agent-sent-123");
    const progressSentMessage = createSentMessage("progress-sent-123");
    const thread = createThread({
      post: mock((message: MockPostMessage) =>
        Promise.resolve(
          isJobProcessingPost(message) ? progressSentMessage : agentSentMessage,
        ),
      ),
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await harness.sendMessage("job-progress", {
      id: "job-standalone",
      type: "job",
      status: "processing",
      message: "Rendering PDF",
      progress: { current: 1, total: 2, percentage: 50 },
      metadata: {
        rootJobId: "job-standalone",
        operationType: "content_operations",
        operationTarget: "Deck",
        interfaceType: "discord",
        channelId: thread.id,
      },
    });
    await harness.sendMessage("job-progress", {
      id: "job-standalone",
      type: "job",
      status: "completed",
      message: "Deck ready",
      metadata: {
        rootJobId: "job-standalone",
        operationType: "content_operations",
        operationTarget: "Deck",
        interfaceType: "discord",
        channelId: thread.id,
      },
    });

    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "Job processing: content operations: Deck 1/2 (50%)\nRendering PDF",
        card: expect.objectContaining({ title: "Job processing" }),
      }),
    );
    expect(progressSentMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Job completed: content operations: Deck\nDeck ready",
        card: expect.objectContaining({ title: "Job completed" }),
      }),
    );
  });

  it("posts terminal Discord job updates when no progress message is tracked", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "I will watch for updates.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });
    const thread = createThread();
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    thread.post.mockClear();
    await harness.sendMessage("job-progress", {
      id: "job-untracked",
      type: "job",
      status: "failed",
      message: "Export failed",
      metadata: {
        rootJobId: "job-untracked",
        operationType: "content_operations",
        operationTarget: "Deck",
        interfaceType: "discord",
        channelId: thread.id,
      },
    });

    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Job failed: content operations: Deck\nExport failed",
        card: expect.objectContaining({ title: "Job failed" }),
      }),
    );
  });

  it("edits standalone Discord progress when async jobs fail", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "Starting background build.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });
    const agentSentMessage = createSentMessage("agent-sent-123");
    const progressSentMessage = createSentMessage("progress-sent-123");
    const thread = createThread({
      post: mock((message: MockPostMessage) =>
        Promise.resolve(
          isJobProcessingPost(message) ? progressSentMessage : agentSentMessage,
        ),
      ),
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await harness.sendMessage("job-progress", {
      id: "job-standalone",
      type: "job",
      status: "processing",
      message: "Rendering PDF",
      progress: { current: 1, total: 2, percentage: 50 },
      metadata: {
        rootJobId: "job-standalone",
        operationType: "content_operations",
        operationTarget: "Deck",
        interfaceType: "discord",
        channelId: thread.id,
      },
    });
    await harness.sendMessage("job-progress", {
      id: "job-standalone",
      type: "job",
      status: "failed",
      message: "Render failed",
      metadata: {
        rootJobId: "job-standalone",
        operationType: "content_operations",
        operationTarget: "Deck",
        interfaceType: "discord",
        channelId: thread.id,
      },
    });

    expect(progressSentMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Job failed: content operations: Deck\nRender failed",
        card: expect.objectContaining({ title: "Job failed" }),
      }),
    );
  });

  it("edits tracked Discord agent responses when async jobs fail", async () => {
    agentService.chat.mockResolvedValueOnce({
      text: "Queued build.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      toolResults: [{ toolName: "site_build", jobId: "job-123" }],
    });
    const sentMessage = createSentMessage();
    const thread = createThread({
      post: mock((_message: MockPostMessage) => Promise.resolve(sentMessage)),
    });
    const plugin = createPlugin();
    await harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await harness.sendMessage("job-progress", {
      id: "job-123",
      type: "job",
      status: "failed",
      message: "Build failed: missing template",
      metadata: {
        rootJobId: "job-123",
        operationType: "content_operations",
        operationTarget: "Site",
        interfaceType: "discord",
        channelId: thread.id,
      },
    });

    expect(sentMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "Job failed: content operations: Site\nBuild failed: missing template",
        card: expect.objectContaining({ title: "Job failed" }),
      }),
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
