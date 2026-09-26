import type {
  AgentNamespace,
  IInterfaceConversationsNamespace,
  InterfaceSetupContext,
} from "@brains/sdk/interfaces";
import type { Logger } from "@brains/utils/logger";
import { ArtifactDeliveryResolver } from "./artifact-delivery";
import { ChatInputBuilder, type ChatFetch } from "./chat-input-builder";
import type { ChatIdentityAccess, ChatPermissionLookup } from "./chat-identity";
import { createChatSdkApp, type ChatSdkApp } from "./chat-sdk";
import { ChatUploadCoordinator } from "./chat-upload-coordinator";
import type { ScopedRuntimeUploadStore } from "@brains/sdk/interfaces";
import type {
  ChatConfig,
  DiscordChatAdapterConfig,
  SlackChatAdapterConfig,
} from "./config";
import type { chatConfigSchema } from "./config";
import { DiscordGatewayLoop } from "./discord-gateway-loop";
import { clearDiscordMessageComponents } from "./discord-message-components";
import { getThreadIdParts } from "./discord-routing";
import { ChatPresenter } from "./presenter";
import { PromptActionStore } from "./prompt-action-store";
import { SlackSocketLoop } from "./slack-socket-loop";
import {
  createThreadSubscriptionStore,
  type ChatThreadSubscriptionStore,
} from "./subscription-state";
import { ThreadRegistry } from "./thread-registry";
import type { ChatPlatform } from "./types";
import {
  createCanonicalChatUploadStoreScope,
  createDiscordChatUploadStoreScope,
  createSlackChatUploadStoreScope,
} from "./upload-store";

/** Cap on retained prompt-action tokens; oldest never-clicked ones evict. */
const MAX_PROMPT_ACTIONS = 1000;

export type ChatSetupContext = InterfaceSetupContext<typeof chatConfigSchema>;

/**
 * Runtime collaborators the interface needs that are not configuration.
 *
 * Config is schema-validated operator input; a fetch implementation is not.
 * Threading it here lets a test hand the attachment downloader a fake and
 * read the requests off it, instead of reassigning globalThis.fetch for the
 * whole process and restoring it afterwards. Production leaves it unset.
 */
export interface ChatPlatformDependencies {
  readonly fetch?: ChatFetch | undefined;
}

/** A listener loop the daemon starts and stops: the Discord gateway, or Slack Socket Mode. */
export interface SupervisedLoop {
  start(): void;
  stop(): Promise<void>;
  isRunning(): boolean;
}

/**
 * What one platform's interface holds while it runs.
 *
 * One Chat SDK app with one adapter, the registries that route what comes back
 * from the runtime to the thread it belongs to, and the namespaces the runtime
 * handed over at setup. Discord and Slack each get their own; nothing here is
 * shared between them, which is what made them two interfaces.
 */
export interface ChatPlatformState {
  readonly platform: ChatPlatform;
  readonly platformConfig: DiscordChatAdapterConfig | SlackChatAdapterConfig;
  readonly app: ChatSdkApp;
  readonly loop: SupervisedLoop | undefined;
  readonly threads: ThreadRegistry;
  readonly promptActions: PromptActionStore;
  readonly subscriptions: ChatThreadSubscriptionStore;
  readonly uploads: ChatUploadCoordinator;
  readonly inputBuilder: ChatInputBuilder;
  readonly presenter: ChatPresenter;
  /** Resolved per call: the auth implementation mounts after registration. */
  readonly identity: () => ChatIdentityAccess | undefined;
  readonly permissions: ChatPermissionLookup;
  readonly agent: AgentNamespace;
  readonly conversations: IInterfaceConversationsNamespace;
  readonly spaces: readonly string[];
  readonly logger: Logger;
  /** Whether the Chat SDK app is initialized and its loop, if any, is up. */
  running: boolean;
}

export function createPlatformState(
  platform: ChatPlatform,
  context: ChatSetupContext,
  dependencies: ChatPlatformDependencies,
): ChatPlatformState {
  const config: ChatConfig = context.config;
  const logger = context.logger;
  const fetchFn: ChatFetch = (input, init) =>
    (dependencies.fetch ?? fetch)(input, init);
  const threads = new ThreadRegistry();
  const promptActions = new PromptActionStore(MAX_PROMPT_ACTIONS);
  const uploads = new ChatUploadCoordinator({
    platform,
    canonical: context.uploads(createCanonicalChatUploadStoreScope()),
    platformStore: context.uploads(
      platform === "discord"
        ? createDiscordChatUploadStoreScope()
        : createSlackChatUploadStoreScope(),
    ),
    loadMessages: (conversationId): Promise<readonly unknown[]> =>
      context.conversations.getMessages(conversationId, { limit: 50 }),
    logger,
  });
  const inputBuilder = new ChatInputBuilder({
    getUploadStore: (): ScopedRuntimeUploadStore => uploads.canonical,
    getThreadIdParts,
    logger,
    fetch: fetchFn,
  });
  const presenter = new ChatPresenter({
    platform,
    threads,
    promptActions,
    displayBaseUrl: context.displayBaseUrl,
    artifacts: new ArtifactDeliveryResolver({
      entities: context.entities,
      displayBaseUrl: context.displayBaseUrl,
      logger,
    }),
    clearMessageComponents: async (threadId, messageId): Promise<void> => {
      const discord = config.adapters.discord;
      if (platform !== "discord" || !discord) return;
      await clearDiscordMessageComponents({
        threadId,
        messageId,
        botToken: discord.botToken,
        logger,
        fetchFn,
      });
    },
    logger,
  });

  const common = {
    platform,
    threads,
    promptActions,
    subscriptions: createThreadSubscriptionStore(context.runtimeState),
    uploads,
    inputBuilder,
    presenter,
    identity: (): ChatIdentityAccess | undefined =>
      context.auth.getIdentities(),
    permissions: context.permissions,
    agent: context.agent,
    conversations: context.conversations,
    spaces: context.spaces,
    logger,
    running: false,
  };

  if (platform === "discord") {
    const discord = config.adapters.discord;
    if (!discord) throw new Error(undeclaredAdapter(platform));
    // The loop asks for the app at each cycle; the app is built just below.
    const loop = new DiscordGatewayLoop({
      getApp: (): ChatSdkApp => app,
      gatewayRunMs: config.gatewayRunMs,
      gatewayRestartDelayMs: config.gatewayRestartDelayMs,
      logger,
    });
    const app = createChatSdkApp({
      userName: config.userName,
      discord,
      gatewayLoop: loop,
      runtimeState: context.runtimeState,
    });
    return { ...common, platformConfig: discord, app, loop };
  }

  const slack = config.adapters.slack;
  if (!slack) throw new Error(undeclaredAdapter(platform));
  const loop =
    slack.mode === "socket"
      ? new SlackSocketLoop({
          listenerRunMs: config.gatewayRunMs,
          restartDelayMs: config.gatewayRestartDelayMs,
          logger,
        })
      : undefined;
  const app = createChatSdkApp({
    userName: config.userName,
    slack,
    ...(loop ? { slackSocketLoop: loop } : {}),
    runtimeState: context.runtimeState,
  });
  return { ...common, platformConfig: slack, app, loop };
}

function undeclaredAdapter(platform: ChatPlatform): string {
  return `Chat interface "${platform}" was instantiated without its adapter configured`;
}
