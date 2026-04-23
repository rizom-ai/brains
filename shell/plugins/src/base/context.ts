import type { IShell } from "../interfaces";
import { derivePreviewDomain, type Logger } from "@brains/utils";
import type {
  MessageHandler,
  MessageSender,
  MessageResponse,
  BaseMessage,
} from "@brains/messaging-service";
import type { Channel } from "../utils/channels";
import { isChannel } from "../utils/channels";
import type { ICoreEntityService } from "@brains/entity-service";
import type { InsightHandler } from "../interfaces";
import type {
  Conversation,
  Message,
  GetMessagesOptions,
} from "@brains/conversation-service";
import type { BrainCharacter } from "@brains/identity-service";
import type { AnchorProfile } from "@brains/identity-service";
import type { AppInfo, EvalHandler } from "../interfaces";
import type { EntityDisplayEntry } from "../types/routes";
import type { JobsNamespace } from "@brains/job-queue";
import {
  createEnqueueJobFn,
  createEnqueueBatchFn,
  createRegisterHandlerFn,
} from "@brains/job-queue";

/**
 * Handler for typed channel subscriptions
 * Receives validated payload and base message metadata
 */
export type TypedMessageHandler<TPayload, TResponse = unknown> = (
  payload: TPayload,
  message: BaseMessage,
) => Promise<MessageResponse<TResponse>> | MessageResponse<TResponse>;

/**
 * Messaging namespace — inter-plugin communication
 */
export interface IMessagingNamespace {
  /** Send a message to other plugins */
  send: MessageSender;

  /**
   * Subscribe to messages on a channel
   *
   * @example String-based (untyped)
   * ```typescript
   * context.messaging.subscribe("my-channel", async (message) => {
   *   const payload = mySchema.parse(message.payload);
   *   return { success: true };
   * });
   * ```
   *
   * @example Channel-based (typed)
   * ```typescript
   * const MyChannel = defineChannel("my-channel", mySchema);
   * context.messaging.subscribe(MyChannel, async (payload) => {
   *   // payload is already validated and typed
   *   return { success: true };
   * });
   * ```
   */
  subscribe: {
    // String-based (existing behavior)
    <T = unknown, R = unknown>(
      channel: string,
      handler: MessageHandler<T, R>,
    ): () => void;

    // Channel-based (typed, with auto-validation)
    <TPayload, TResponse = unknown>(
      channel: Channel<TPayload, TResponse>,
      handler: TypedMessageHandler<TPayload, TResponse>,
    ): () => void;
  };
}

/**
 * Identity namespace — brain identity and profile
 */
export interface IIdentityNamespace {
  /** Get the brain's character configuration */
  get: () => BrainCharacter;

  /** Get the anchor's profile */
  getProfile: () => AnchorProfile;

  /** Get app metadata (version, model, plugins) */
  getAppInfo: () => Promise<AppInfo>;
}

/**
 * Conversations namespace — read-only access
 */
export interface IConversationsNamespace {
  /** Get a conversation by ID */
  get: (conversationId: string) => Promise<Conversation | null>;

  /** Search conversations by query */
  search: (query: string) => Promise<Conversation[]>;

  /** Get messages from a conversation */
  getMessages: (
    conversationId: string,
    options?: GetMessagesOptions,
  ) => Promise<Message[]>;
}

/**
 * Eval namespace — cross-cutting testing concern for all plugin types
 */
export interface IEvalNamespace {
  registerHandler: (handlerId: string, handler: EvalHandler) => void;
}

/**
 * Insights namespace — register domain-specific insight handlers
 */
export interface IInsightsNamespace {
  /** Register a named insight handler */
  register: (type: string, handler: InsightHandler) => void;
}

/**
 * Base plugin context — shared by all plugin types (Entity, Service, Interface).
 *
 * Contains only capabilities that every plugin needs.
 * AI, templates, views, and transport are on sibling contexts.
 */
export interface BasePluginContext {
  // ============================================================================
  // Plugin Identity
  // ============================================================================

  /** Unique plugin identifier */
  readonly pluginId: string;

  /** Logger instance for this plugin */
  readonly logger: Logger;

  /** Data directory for storing entity files */
  readonly dataDir: string;

  /** Bare domain string (e.g. "yeehaa.io"), undefined for local dev */
  readonly domain: string | undefined;

  /** Production site URL derived from domain (e.g. "https://yeehaa.io"), undefined if no domain */
  readonly siteUrl: string | undefined;

  /** Preview site URL derived from domain (e.g. "https://preview.yeehaa.io" or "https://recall-preview.rizom.ai"), undefined if no domain */
  readonly previewUrl: string | undefined;

  /** Entity display metadata from the active site package, if any */
  readonly entityDisplay: Record<string, EntityDisplayEntry> | undefined;

  /** App metadata (version, model, plugins) */
  readonly appInfo: () => Promise<AppInfo>;

  // ============================================================================
  // Entity Service (Read-Only)
  // ============================================================================

  /** Core entity service with read-only operations */
  readonly entityService: ICoreEntityService;

  // ============================================================================
  // Brain Identity & Profile
  // ============================================================================

  /**
   * Identity namespace
   * - `identity.get()` - Get the brain's identity configuration
   * - `identity.getProfile()` - Get the owner's profile
   * - `identity.getAppInfo()` - Get app metadata
   */
  readonly identity: IIdentityNamespace;

  // ============================================================================
  // Inter-Plugin Messaging
  // ============================================================================

  /**
   * Messaging namespace
   * - `messaging.send()` - Send a message to other plugins
   * - `messaging.subscribe()` - Subscribe to messages on a channel
   */
  readonly messaging: IMessagingNamespace;

  // ============================================================================
  // Job Queue (monitoring + scoped write)
  // ============================================================================

  /** Job operations — monitoring + plugin-scoped enqueue/registerHandler */
  readonly jobs: JobsNamespace;

  // ============================================================================
  // Conversations (Read-Only)
  // ============================================================================

  /**
   * Conversations namespace
   * - `conversations.get()` - Get a conversation by ID
   * - `conversations.search()` - Search conversations by query
   * - `conversations.getMessages()` - Get messages from a conversation
   */
  readonly conversations: IConversationsNamespace;

  // ============================================================================
  // Evaluation
  // ============================================================================

  /**
   * Eval namespace for plugin testing
   * - `eval.registerHandler()` - Register an eval handler
   */
  readonly eval: IEvalNamespace;

  // ============================================================================
  // Insights
  // ============================================================================

  /**
   * Insights namespace
   * - `insights.register()` - Register a domain-specific insight handler
   */
  readonly insights: IInsightsNamespace;

  // ============================================================================
  // Endpoint Advertisement
  // ============================================================================

  /**
   * Endpoints namespace — advertise this plugin's user-facing URLs
   * so they surface in `appInfo.endpoints` for the dashboard and
   * other operator-facing consumers.
   */
  readonly endpoints: IEndpointsNamespace;
}

export interface IEndpointsNamespace {
  /** Register a user-facing URL for this plugin */
  register(endpoint: { label: string; url: string; priority?: number }): void;
}

/**
 * Create a BasePluginContext from the shell.
 *
 * Used by all three sibling context factories (entity, service, interface).
 */
export function createBasePluginContext(
  shell: IShell,
  pluginId: string,
): BasePluginContext {
  const messageBus = shell.getMessageBus();
  const entityService = shell.getEntityService();
  const jobQueueService = shell.getJobQueueService();
  const logger = shell.getLogger().child(pluginId);
  const domain = shell.getDomain();

  const sendMessage: MessageSender = async (channel, message, options) => {
    return messageBus.send(
      channel,
      message,
      pluginId,
      undefined,
      undefined,
      options?.broadcast,
    );
  };

  return {
    pluginId,
    logger,
    entityService,

    identity: {
      get: () => shell.getIdentity(),
      getProfile: () => shell.getProfile(),
      getAppInfo: () => shell.getAppInfo(),
    },

    appInfo: () => shell.getAppInfo(),

    domain,
    siteUrl: domain ? `https://${domain}` : undefined,
    previewUrl: domain ? `https://${derivePreviewDomain(domain)}` : undefined,
    entityDisplay: shell.getEntityDisplay(),

    messaging: {
      send: sendMessage,
      subscribe: <T = unknown, R = unknown>(
        channelOrName: string | Channel<T, R>,
        handler: MessageHandler<T, R> | TypedMessageHandler<T, R>,
      ): (() => void) => {
        if (isChannel(channelOrName)) {
          const channel = channelOrName;
          const typedHandler = handler as TypedMessageHandler<T, R>;

          const wrappedHandler: MessageHandler<unknown, R> = async (
            message,
          ) => {
            const parseResult = channel.schema.safeParse(message.payload);
            if (!parseResult.success) {
              logger.warn(`Invalid payload for channel ${channel.name}`, {
                error: parseResult.error.message,
              });
              return { noop: true };
            }

            const { payload: _payload, ...baseMessage } = message;
            return typedHandler(parseResult.data as T, baseMessage);
          };

          return messageBus.subscribe(channel.name, wrappedHandler);
        }

        return messageBus.subscribe(
          channelOrName,
          handler as MessageHandler<T, R>,
        );
      },
    },

    jobs: {
      ...shell.jobs,
      enqueue: createEnqueueJobFn(jobQueueService, pluginId, true),
      enqueueBatch: createEnqueueBatchFn(shell.jobs, pluginId),
      registerHandler: createRegisterHandlerFn(jobQueueService, pluginId),
    },

    conversations: {
      get: async (conversationId: string): Promise<Conversation | null> => {
        const conversationService = shell.getConversationService();
        return conversationService.getConversation(conversationId);
      },
      search: async (query: string): Promise<Conversation[]> => {
        const conversationService = shell.getConversationService();
        return conversationService.searchConversations(query);
      },
      getMessages: async (
        conversationId: string,
        options?: GetMessagesOptions,
      ): Promise<Message[]> => {
        const conversationService = shell.getConversationService();
        return conversationService.getMessages(conversationId, options);
      },
    },

    dataDir: shell.getDataDir(),

    eval: {
      registerHandler: (handlerId: string, handler: EvalHandler): void => {
        shell.registerEvalHandler(pluginId, handlerId, handler);
      },
    },

    insights: {
      register: (type: string, handler: InsightHandler): void => {
        shell.getInsightsRegistry().register(type, handler);
      },
    },

    endpoints: {
      register: ({ label, url, priority = 100 }): void => {
        shell.registerEndpoint({ label, url, pluginId, priority });
      },
    },
  };
}
