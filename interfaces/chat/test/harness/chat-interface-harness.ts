import { afterEach, beforeEach, expect, mock } from "bun:test";
import { createExternalActorId } from "@brains/contracts";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginTestHarness } from "@brains/plugins/test";
import type { ChatContext, ToolActivityEvent } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type {
  DiscordChatAdapterConfig,
  SlackChatAdapterConfig,
} from "../../src/config";
import type {
  ChatAdapterMap,
  DiscordChatAdapter,
  GatewayListenerOptions,
} from "../../src/types";
import type { Mock } from "bun:test";
import type { ActionEvent, CardElement, StateAdapter } from "chat";
// Type-only, so it is erased and cannot evaluate the module before the
// mock.module() registrations below.
import type * as ChatInterfaceModule from "../../src/chat-interface";
import type { ChatIdentityAccess } from "../../src/chat-identity";

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
 * mock.module() registrations below — are one shared instance across all
 * twelve ChatInterface suites. Keeping the mutable parts in a holder that only
 * exists between beforeEach and afterEach is what stops one suite's state from
 * reaching another: outside a test there is nothing to read, so an ordering
 * mistake fails loudly here instead of silently handing over a stale adapter,
 * SDK instance, or auth resolver.
 */
interface HarnessState {
  discordAdapter: MockDiscordAdapter | undefined;
  slackAdapter: MockSlackAdapter | undefined;
  resolveIdentityAccess: ResolveIdentityAccessMock | undefined;
  sdkInstances: MockChatSdk[];
}

let activeState: HarnessState | undefined;

function state(): HarnessState {
  if (!activeState) {
    throw new Error(
      "ChatInterface harness state was touched outside a test. Suites must call setupChatInterfaceTest() at the top level, and nothing may read harness state from module scope.",
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

export interface MockAuthPrincipal {
  userId: string;
  personId: string;
  displayName: string;
  role: "admin" | "trusted" | "public";
  status: "active" | "invited" | "suspended";
  permissionLevel: "admin" | "trusted" | "public";
  isAnchor: boolean;
  canonicalId?: string;
}

export type MockIdentityResolution =
  | { state: "resolved"; principal: MockAuthPrincipal }
  | { state: "denied" }
  | { state: "unbound" };

export type ResolveIdentityAccessMock = Mock<
  (input: { type: string; subject: string }) => Promise<MockIdentityResolution>
>;

export interface AuthStateAccess {
  resolveIdentityAccess: ResolveIdentityAccessMock | undefined;
}

/**
 * The auth-service lookup the mocked module hands out. Suites assign
 * `authState.resolveIdentityAccess` to bind a linked identity for one test;
 * it lives on the per-test state, so it cannot survive into the next one.
 */
export const authState: AuthStateAccess = {
  get resolveIdentityAccess(): ResolveIdentityAccessMock | undefined {
    return state().resolveIdentityAccess;
  },
  set resolveIdentityAccess(resolver: ResolveIdentityAccessMock | undefined) {
    state().resolveIdentityAccess = resolver;
  },
};

/**
 * Handed to ChatInterface as its identity lookup. No mock.module for
 * @brains/auth-service: replacing an internal workspace module only works
 * while nothing has imported it yet, so it made these suites depend on file
 * order. mock.module here is reserved for the genuinely external chat SDK and
 * adapter packages below.
 */
function harnessIdentityAccess(): ChatIdentityAccess | undefined {
  const resolver = authState.resolveIdentityAccess;
  return resolver ? { resolveIdentityAccess: resolver } : undefined;
}

// Imported dynamically so every mock.module() call above is registered before
// the interface module — and its adapter/SDK imports — are first evaluated.
// Suites must take ChatInterface from here rather than importing the module
// directly, or they get an unmocked copy.
const { ChatInterface: LoadedChatInterface } =
  await import("../../src/chat-interface");

export const ChatInterface: typeof ChatInterfaceModule.ChatInterface =
  LoadedChatInterface;

export type ChatInterfaceInstance = InstanceType<typeof ChatInterface>;
export type ChatInterfaceWithToolActivity = ChatInterfaceInstance & {
  handleToolActivityEvent(event: ToolActivityEvent): Promise<void>;
};

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

export function createFetchStub(
  originalFetch: typeof fetch,
  handler: (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => Promise<Response>,
): typeof fetch {
  return Object.assign(handler, { preconnect: originalFetch.preconnect });
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

export function createPlugin(
  discordConfig: Partial<DiscordChatAdapterConfig> = {},
): ChatInterfaceInstance {
  return new ChatInterface(
    {
      adapters: {
        discord: {
          ...baseDiscordConfig,
          ...discordConfig,
        },
      },
      gatewayRunMs: 50,
    },
    harnessIdentityAccess,
  );
}

export interface ChatInterfaceTestContext {
  harness: PluginTestHarness<ChatInterfaceInstance>;
  agentService: MockAgentService;
}

/**
 * Installs the beforeEach/afterEach every ChatInterface suite needs: fresh
 * adapter mocks, a stubbed global fetch, and a plugin harness wired to a mock
 * agent service. The returned context is mutated in place, so suites read
 * `context.harness` inside their tests rather than destructuring it.
 */
export function setupChatInterfaceTest(): ChatInterfaceTestContext {
  const context: ChatInterfaceTestContext = {
    harness: createPluginHarness<ChatInterfaceInstance>(),
    agentService: createAgentService(),
  };
  let originalFetch: typeof fetch;

  beforeEach(() => {
    // A fresh holder per test: nothing from the previous test — or from a
    // suite that ran earlier in this process — is reachable.
    activeState = {
      discordAdapter: undefined,
      slackAdapter: undefined,
      resolveIdentityAccess: undefined,
      sdkInstances: [],
    };
    createDiscordAdapterMock.mockClear();
    createSlackAdapterMock.mockClear();
    createMemoryStateMock.mockClear();
    originalFetch = globalThis.fetch;
    globalThis.fetch = createFetchStub(originalFetch, (_input, _init) =>
      Promise.resolve(new Response("{}")),
    );
    context.agentService = createAgentService();
    context.harness = createPluginHarness<ChatInterfaceInstance>();
    context.harness.setAgentService(context.agentService);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    context.harness.reset();
    activeState = undefined;
  });

  return context;
}

/**
 * Reach the protected tool-activity hook.
 *
 * The tests drive this directly because a tool event arrives mid-turn, from
 * inside the agent call they are already stubbing; going through messaging
 * would mean rebuilding that turn. `protected` is not reachable from outside
 * the class, so a widening is unavoidable — but it belongs here, named once,
 * rather than repeated at every call site where it reads like an ordinary cast.
 */
export function withToolActivity(
  plugin: ChatInterfaceInstance,
): ChatInterfaceWithToolActivity {
  return plugin as ChatInterfaceWithToolActivity;
}
