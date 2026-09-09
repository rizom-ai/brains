import { afterEach, beforeEach, expect, mock } from "bun:test";
import { createExternalActorId } from "@brains/contracts";
import type { Plugin } from "@brains/plugins";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import {
  createPluginHarness,
  createStubAuth,
  type PluginTestHarness,
} from "@brains/plugins/test";
import type {
  AuthIdentities,
  ChatContext,
  ScopedRuntimeUploadStore,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type {
  ChatConfigInput,
  DiscordChatAdapterConfig,
  SlackChatAdapterConfig,
} from "../../src/config";
import type {
  ChatAdapterMap,
  ChatPlatform,
  DiscordChatAdapter,
  GatewayListenerOptions,
} from "../../src/types";
import {
  createCanonicalChatUploadStoreScope,
  createDiscordChatUploadStoreScope,
  createSlackChatUploadStoreScope,
} from "../../src/upload-store";
import type { Mock } from "bun:test";
import type { ActionEvent, CardElement, StateAdapter } from "chat";
// Type-only, so it is erased and cannot evaluate the module before the
// mock.module() registrations below.
import type * as ChatPackage from "../../src";

export const PACKAGE_NAME = "@brains/chat";
export const DISCORD_PLUGIN_ID: string = `${PACKAGE_NAME}:discord`;
export const SLACK_PLUGIN_ID: string = `${PACKAGE_NAME}:slack`;

export const discordExternalIdentity: {
  kind: "external";
  externalActorId: ReturnType<typeof createExternalActorId>;
} = {
  kind: "external",
  externalActorId: createExternalActorId("discord", "user-789"),
};

type HarnessAgentService = Parameters<PluginTestHarness["setAgentService"]>[0];
type HarnessAgentResponse = Awaited<ReturnType<HarnessAgentService["chat"]>>;

export interface MockAgentService extends HarnessAgentService {
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

export interface MockDiscordAdapter extends DiscordChatAdapter {
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

interface SlackAdapterFactoryConfig {
  botToken: string;
  mode?: "socket";
  signingSecret?: string;
  appToken?: string;
}

export interface MockSlackAdapter {
  name: "slack";
  handleWebhook: Mock<() => Promise<Response>>;
  startSocketModeListener: Mock<
    (
      options: GatewayListenerOptions,
      durationMs?: number,
      abortSignal?: AbortSignal,
      webhookUrl?: string,
    ) => Promise<Response>
  >;
}

/**
 * Everything the mocked modules write to during one test.
 *
 * bun evaluates every suite in a single process, so this module — and the
 * mock.module() registrations below — are one shared instance across all the
 * chat suites. Keeping the mutable parts in a holder that only exists between
 * beforeEach and afterEach is what stops one suite's state from reaching
 * another: outside a test there is nothing to read, so an ordering mistake
 * fails loudly here instead of silently handing over a stale adapter, SDK
 * instance, or fetch.
 */
type HarnessFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface HarnessState {
  discordAdapter: MockDiscordAdapter | undefined;
  slackAdapter: MockSlackAdapter | undefined;
  sdkInstances: MockChatSdk[];
  /** What the interface's attachment downloader reaches. Swap it per test. */
  fetch: HarnessFetch;
}

/**
 * Point the interface's attachment downloader at a fake for the current test.
 *
 * The package is built with a delegate that reads this at download time, so
 * it can be set before or after the plugins exist. It lives in per-test state,
 * so there is nothing to restore.
 */
export function stubFetch(handler: HarnessFetch): void {
  state().fetch = handler;
}

let activeState: HarnessState | undefined;

function state(): HarnessState {
  if (!activeState) {
    throw new Error(
      "Chat harness state was touched outside a test. Suites must call setupChatInterfaceTest() at the top level, and nothing may read harness state from module scope.",
    );
  }
  return activeState;
}

export interface LastAdapterAccess {
  discord: MockDiscordAdapter | undefined;
  slack: MockSlackAdapter | undefined;
}

/** The adapters the most recent mount built, scoped to the running test. */
export const lastAdapter: LastAdapterAccess = {
  get discord(): MockDiscordAdapter | undefined {
    return state().discordAdapter;
  },
  set discord(adapter: MockDiscordAdapter | undefined) {
    state().discordAdapter = adapter;
  },
  get slack(): MockSlackAdapter | undefined {
    return state().slackAdapter;
  },
  set slack(adapter: MockSlackAdapter | undefined) {
    state().slackAdapter = adapter;
  },
};

export const createDiscordAdapterMock: Mock<
  (config: DiscordAdapterFactoryConfig) => MockDiscordAdapter
> = mock((_config: DiscordAdapterFactoryConfig): MockDiscordAdapter => {
  lastAdapter.discord = {
    name: "discord",
    startGatewayListener: mock(
      (
        _options: GatewayListenerOptions,
        _durationMs?: number,
        _abortSignal?: AbortSignal,
        _webhookUrl?: string,
      ) =>
        Promise.resolve(new Response(JSON.stringify({ status: "listening" }))),
    ),
    handleWebhook: mock(() => Promise.resolve(new Response("ok"))),
  };
  return lastAdapter.discord;
});

export const createSlackAdapterMock: Mock<
  (config: SlackAdapterFactoryConfig) => MockSlackAdapter
> = mock((_config: SlackAdapterFactoryConfig): MockSlackAdapter => {
  lastAdapter.slack = {
    name: "slack",
    handleWebhook: mock(() => Promise.resolve(new Response("slack ok"))),
    startSocketModeListener: mock(
      (
        _options: GatewayListenerOptions,
        _durationMs?: number,
        _abortSignal?: AbortSignal,
        _webhookUrl?: string,
      ) => Promise.resolve(new Response("socket ok")),
    ),
  };
  return lastAdapter.slack;
});

interface MockMemoryState {
  connect: Mock<() => Promise<void>>;
  disconnect: Mock<() => Promise<void>>;
}

export const createMemoryStateMock: Mock<() => MockMemoryState> = mock(
  (): MockMemoryState => ({
    connect: mock(() => Promise.resolve()),
    disconnect: mock(() => Promise.resolve()),
  }),
);

interface MockChatSdkConfig {
  adapters: ChatAdapterMap;
  concurrency?: unknown;
  state?: StateAdapter;
  userName?: string;
}

interface MockMessageContext {
  skipped: MockMessage[];
  totalSinceLastHandler: number;
}

interface RegisteredHandlers {
  directMessages: Array<
    (
      thread: MockThread,
      message: MockMessage,
      channel: MockThread,
      context?: MockMessageContext,
    ) => Promise<void>
  >;
  mentions: Array<
    (
      thread: MockThread,
      message: MockMessage,
      context?: MockMessageContext,
    ) => Promise<void>
  >;
  messagePatterns: Array<{
    pattern: RegExp;
    handler: (
      thread: MockThread,
      message: MockMessage,
      context?: MockMessageContext,
    ) => Promise<void>;
  }>;
  subscribedMessages: Array<
    (
      thread: MockThread,
      message: MockMessage,
      context?: MockMessageContext,
    ) => Promise<void>
  >;
  actions: Array<{
    actionIds: string[] | string;
    handler: (event: MockActionEvent) => Promise<void>;
  }>;
}

export class MockChatSdk {
  /** Scoped to the running test; see HarnessState. */
  static get instances(): MockChatSdk[] {
    return state().sdkInstances;
  }
  static set instances(instances: MockChatSdk[]) {
    state().sdkInstances = instances;
  }
  /** The app built for one platform's interface, when it was. */
  static forPlatform(platform: ChatPlatform): MockChatSdk | undefined {
    return state().sdkInstances.find(
      (instance) => instance.config.adapters[platform] !== undefined,
    );
  }
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
    slack?: Mock<(request: Request) => Promise<Response>>;
  };
  initialize: Mock<() => Promise<void>> = mock(() => Promise.resolve());
  shutdown: Mock<() => Promise<void>> = mock(() => Promise.resolve());

  constructor(config: MockChatSdkConfig) {
    this.config = config;
    this.webhooks = {
      ...(config.adapters.discord
        ? {
            discord: mock((_request: Request) =>
              Promise.resolve(new Response("webhook ok")),
            ),
          }
        : {}),
      ...(config.adapters.slack
        ? {
            slack: mock((_request: Request) =>
              Promise.resolve(new Response("slack webhook ok")),
            ),
          }
        : {}),
    };
    MockChatSdk.instances.push(this);
  }

  onDirectMessage(
    handler: (
      thread: MockThread,
      message: MockMessage,
      channel: MockThread,
      context?: MockMessageContext,
    ) => Promise<void>,
  ): void {
    this.handlers.directMessages.push(handler);
  }

  onNewMention(
    handler: (
      thread: MockThread,
      message: MockMessage,
      context?: MockMessageContext,
    ) => Promise<void>,
  ): void {
    this.handlers.mentions.push(handler);
  }

  onNewMessage(
    pattern: RegExp,
    handler: (
      thread: MockThread,
      message: MockMessage,
      context?: MockMessageContext,
    ) => Promise<void>,
  ): void {
    this.handlers.messagePatterns.push({ pattern, handler });
  }

  onSubscribedMessage(
    handler: (
      thread: MockThread,
      message: MockMessage,
      context?: MockMessageContext,
    ) => Promise<void>,
  ): void {
    this.handlers.subscribedMessages.push(handler);
  }

  onAction(
    actionIdsOrHandler:
      string[] | string | ((event: MockActionEvent) => Promise<void>),
    handler?: (event: MockActionEvent) => Promise<void>,
  ): void {
    if (typeof actionIdsOrHandler === "function") {
      this.handlers.actions.push({
        actionIds: [],
        handler: actionIdsOrHandler,
      });
      return;
    }
    if (handler) {
      this.handlers.actions.push({ actionIds: actionIdsOrHandler, handler });
    }
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

void mock.module("@chat-adapter/slack", () => ({
  createSlackAdapter: createSlackAdapterMock,
}));

void mock.module("@chat-adapter/state-memory", () => ({
  createMemoryState: createMemoryStateMock,
}));

export type ResolveIdentityAccessMock = Mock<
  AuthIdentities["resolveIdentityAccess"]
>;

// Imported dynamically so every mock.module() call above is registered before
// the package module — and its adapter/SDK imports — is first evaluated.
// Suites must take the package from here rather than importing the module
// directly, or they get an unmocked copy.
const chatModule: typeof ChatPackage = await import("../../src");

export interface MockSentMessage {
  id: string;
  delete: Mock<() => Promise<void>>;
  edit: Mock<(newContent: unknown) => Promise<MockSentMessage>>;
}

export type MockPostMessage =
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

export function isJobProcessingPost(message: MockPostMessage): boolean {
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
          content: z.string().optional(),
          children: z.array(cardActionButtonSchema).optional(),
        })
        .passthrough(),
    ),
  }),
});

const promptActionPostSchema = cardPostSchema;

export interface CardActionButton {
  type: string;
  id?: string | undefined;
  label?: string | undefined;
  url?: string | undefined;
  value?: string | undefined;
}

export interface PostedCardChild {
  type: string;
  content?: string | undefined;
  children?: CardActionButton[] | undefined;
}

export interface PostedCard {
  title?: string | undefined;
  children: PostedCardChild[];
}

/** The first card this thread posted under `title`, or undefined if none was. */
export function findPostedCard(
  thread: MockThread,
  title: string,
): PostedCard | undefined {
  for (const [message] of thread.post.mock.calls) {
    const parsed = cardPostSchema.safeParse(message);
    if (parsed.success && parsed.data.card.title === title) {
      return parsed.data.card;
    }
  }
  return undefined;
}

export function getCardActionButtons(
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

export function getPromptActionTokens(thread: MockThread): string[] {
  const tokens: string[] = [];
  for (const [message] of thread.post.mock.calls) {
    const parsed = promptActionPostSchema.safeParse(message);
    if (!parsed.success) continue;
    for (const child of parsed.data.card.children) {
      for (const button of child.children ?? []) {
        if (
          button.type === "button" &&
          (button.id === "chat.prompt" ||
            button.id?.startsWith("chat.prompt:")) &&
          button.value
        ) {
          tokens.push(button.value);
        }
      }
    }
  }
  return tokens;
}

export function getFirstPromptActionToken(thread: MockThread): string {
  const [token] = getPromptActionTokens(thread);
  if (token) return token;
  throw new Error("Prompt action token not found");
}

export interface MockThread {
  id: string;
  channelId: string;
  isDM: boolean;
  adapter: { name: string };
  subscribe: Mock<() => Promise<void>>;
  post: Mock<(message: MockPostMessage) => Promise<MockSentMessage>>;
  startTyping: Mock<() => Promise<void>>;
  getParticipants: Mock<() => Promise<MockMessage["author"][]>>;
}

export interface MockActionEvent extends Omit<
  ActionEvent,
  "thread" | "adapter" | "openModal"
> {
  adapter: { name: string };
  thread: MockThread | null;
  openModal: ActionEvent["openModal"];
}

export interface MockMessage {
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

export function createAgentService(): MockAgentService {
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

export function createSentMessage(id = "sent-123"): MockSentMessage {
  const sentMessage: MockSentMessage = {
    id,
    delete: mock(() => Promise.resolve()),
    edit: mock((_newContent: unknown) => Promise.resolve(sentMessage)),
  };
  return sentMessage;
}

export function createThread(overrides: Partial<MockThread> = {}): MockThread {
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
    getParticipants: mock(() =>
      Promise.resolve([
        {
          userId: "user-789",
          userName: "mira",
          fullName: "Mira Ops",
          isBot: false,
          isMe: false,
        },
      ]),
    ),
    ...overrides,
  };
}

export function createMessage(
  overrides: Partial<MockMessage> = {},
): MockMessage {
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

export const baseDiscordConfig: DiscordChatAdapterConfig = {
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

export const baseSlackConfig: SlackChatAdapterConfig = {
  botToken: "slack-token",
  mode: "webhook",
  signingSecret: "slack-signing-secret",
  allowedChannels: [],
  blockedUrlDomains: [],
  requireMention: true,
  allowDMs: true,
  showTypingIndicator: true,
  captureUrls: false,
};

export const socketSlackConfig: SlackChatAdapterConfig = {
  ...baseSlackConfig,
  mode: "socket",
  signingSecret: undefined,
  appToken: "xapp-test",
};

export function expectDiscordConfirmationContext(
  userPermissionLevel: "admin" | "trusted" | "public" = "public",
): unknown {
  return expect.objectContaining({
    channelId: "discord:guild-123:channel-123:thread-456",
    channelName: "discord:guild-123:channel-123",
    interfaceType: "discord",
    userPermissionLevel,
  });
}

/**
 * The package's plugins for a config: one per platform it holds credentials
 * for. Built with a fetch delegate that reads the per-test stub at download
 * time, so `stubFetch()` works before or after the plugins exist.
 */
export function createPlugins(config: ChatConfigInput): Plugin[] {
  return instantiatePluginPackageDefinition(
    chatModule.chatInterfaces({
      fetch: (input, init): Promise<Response> => state().fetch(input, init),
    }),
    config,
    { name: PACKAGE_NAME, version: "0.1.0" },
  );
}

/** The Discord interface, configured as most suites want it. */
export function createPlugin(
  discordConfig: Partial<DiscordChatAdapterConfig> = {},
): Plugin {
  const [plugin] = createPlugins({
    adapters: { discord: { ...baseDiscordConfig, ...discordConfig } },
    gatewayRunMs: 50,
  });
  if (!plugin) throw new Error("Discord chat plugin was not created");
  return plugin;
}

/** The Slack interface, alone. */
export function createSlackPlugin(
  slackConfig: SlackChatAdapterConfig = baseSlackConfig,
  config: Omit<ChatConfigInput, "adapters"> = {},
): Plugin {
  const [plugin] = createPlugins({
    ...config,
    adapters: { slack: slackConfig },
  });
  if (!plugin) throw new Error("Slack chat plugin was not created");
  return plugin;
}

export interface ChatInterfaceTestContext {
  harness: PluginTestHarness;
  agentService: MockAgentService;
  /**
   * Bind platform identities to accounts for this test, the way a mounted
   * auth service would. The mock is what the interface calls, so a suite
   * asserts on it directly.
   */
  bindIdentity: (resolver: ResolveIdentityAccessMock) => void;
  /** Install every plugin the config produces and return them. */
  install: (config: ChatConfigInput) => Promise<Plugin[]>;
}

/**
 * Installs the beforeEach/afterEach every chat suite needs: fresh adapter
 * mocks, a per-test fetch the package is built to use, and a plugin harness
 * wired to a mock agent service. The returned context is mutated in place, so
 * suites read `context.harness` inside their tests rather than destructuring it.
 */
export function setupChatInterfaceTest(): ChatInterfaceTestContext {
  const context: ChatInterfaceTestContext = {
    harness: createPluginHarness(),
    agentService: createAgentService(),
    bindIdentity: (resolver): void => {
      context.harness
        .getMockShell()
        .getAuthRegistry()
        .register(createStubAuth({ identityAccess: resolver }));
    },
    install: async (config): Promise<Plugin[]> => {
      const plugins = createPlugins(config);
      for (const plugin of plugins) {
        await context.harness.installPlugin(plugin);
      }
      return plugins;
    },
  };
  beforeEach(() => {
    // A fresh holder per test: nothing from the previous test — or from a
    // suite that ran earlier in this process — is reachable.
    activeState = {
      discordAdapter: undefined,
      slackAdapter: undefined,
      sdkInstances: [],
      fetch: (): Promise<Response> => Promise.resolve(new Response("{}")),
    };
    createDiscordAdapterMock.mockClear();
    createSlackAdapterMock.mockClear();
    createMemoryStateMock.mockClear();
    context.agentService = createAgentService();
    context.harness = createPluginHarness();
    context.harness.setAgentService(context.agentService);
  });

  afterEach(async () => {
    await context.harness.reset();
    activeState = undefined;
  });

  return context;
}

// Expected runtime directories for ["@brains/chat", platform, local namespace].
const UPLOAD_NAMESPACES = {
  discord: {
    canonical:
      "interface-upload-17c36029963d5c1c760d0d786b9574f48267b07e8daece448a28e4bff4215333",
    platform:
      "interface-upload-672532975b348b519396ff681695f321db24c823a8cfe95d90693b885ef41cd6",
  },
  slack: {
    canonical:
      "interface-upload-d26338a434a91e4dad54fa12743765f1f5527450a7c2d2ffe6d61c43ccef934f",
    platform:
      "interface-upload-d272790e838cf0054184d9e485f91ee9ab70b29ebae7ee460fff0b5268440afa",
  },
};

/** The store addressed by the platform-specific upload route. */
export function platformUploadStore(
  harness: PluginTestHarness,
  platform: ChatPlatform,
): ScopedRuntimeUploadStore {
  const scope =
    platform === "discord"
      ? createDiscordChatUploadStoreScope()
      : createSlackChatUploadStoreScope();
  return harness
    .getMockShell()
    .getRuntimeUploadRegistry()
    .scoped({ ...scope, namespace: UPLOAD_NAMESPACES[platform].platform });
}

/** The canonical store, scoped to this platform and package. */
export function canonicalUploadStore(
  harness: PluginTestHarness,
  platform: ChatPlatform,
): ScopedRuntimeUploadStore {
  const scope = createCanonicalChatUploadStoreScope();
  return harness
    .getMockShell()
    .getRuntimeUploadRegistry()
    .scoped({ ...scope, namespace: UPLOAD_NAMESPACES[platform].canonical });
}

/** A tool's activity, as the runtime publishes it for the interface to draw. */
export async function sendToolActivity(
  harness: PluginTestHarness,
  event: {
    type: "tool:invoking" | "tool:completed" | "tool:failed";
    toolName: string;
    conversationId: string;
    interfaceType: string;
    channelId?: string;
    error?: string;
  },
): Promise<void> {
  const { type, ...payload } = event;
  await harness.sendMessage(type, payload);
}

/**
 * The turn the agent was asked, ignoring the abort signal the runtime hands
 * along as a fourth argument — a test about routing has nothing to say about
 * cancellation.
 */
export function expectAgentChat(
  agent: MockAgentService,
  message: unknown,
  conversationId: string,
  context: unknown,
): void {
  expect(agent.chat).toHaveBeenCalledWith(
    message,
    conversationId,
    context,
    expect.anything(),
  );
}
