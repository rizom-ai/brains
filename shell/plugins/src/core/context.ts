import type { IShell } from "../interfaces";
import type { DefaultQueryResponse } from "@brains/utils";
import type { Logger } from "@brains/utils";
import type {
  MessageHandler,
  MessageSender,
  MessageResponse,
  BaseMessage,
} from "@brains/messaging-service";
import type { Channel } from "../utils/channels";
import { isChannel } from "../utils/channels";
import type { Template } from "@brains/templates";
import type { ICoreEntityService } from "@brains/entity-service";
import type {
  Conversation,
  Message,
  GetMessagesOptions,
} from "@brains/conversation-service";
import type { IdentityBody } from "@brains/identity-service";
import type { ProfileBody } from "@brains/profile-service";
import type { AppInfo } from "../interfaces";
import type {
  IJobsNamespace,
  JobHandler,
  BatchOperation,
  JobOptions,
} from "@brains/job-queue";
import type { EnqueueJobFn } from "../shared/job-helpers";

/**
 * Extended jobs namespace with write operations
 * Used by both ServicePluginContext and InterfacePluginContext
 */
export interface IJobsWriteNamespace
  extends Omit<IJobsNamespace, "enqueueBatch"> {
  /**
   * Enqueue a job for background processing
   * @param type - Job type (will be auto-scoped with plugin ID for service plugins)
   * @param data - Job payload
   * @param toolContext - Pass ToolContext from tool handler, or null for background jobs
   * @param options - Optional job options
   */
  enqueue: EnqueueJobFn;

  /** Enqueue multiple operations as a batch (simplified - batchId generated internally) */
  enqueueBatch: (
    operations: BatchOperation[],
    options?: JobOptions,
  ) => Promise<string>;

  /** Register a handler for a job type (auto-scoped with plugin ID) */
  registerHandler: <T = unknown, R = unknown>(
    type: string,
    handler: JobHandler<string, T, R>,
  ) => void;
}

/**
 * Template operations namespace for CorePluginContext
 * Provides methods for registering and using templates
 */
export interface ITemplatesNamespace {
  /** Register templates for this plugin */
  register: (templates: Record<string, Template>) => void;

  /** Format data using a template formatter */
  format: <T = unknown>(
    templateName: string,
    data: T,
    options?: { truncate?: number },
  ) => string;

  /** Parse content using a template parser */
  parse: <T = unknown>(templateName: string, content: string) => T;
}

/**
 * Handler for typed channel subscriptions
 * Receives validated payload and base message metadata
 */
export type TypedMessageHandler<TPayload, TResponse = unknown> = (
  payload: TPayload,
  message: BaseMessage,
) => Promise<MessageResponse<TResponse>> | MessageResponse<TResponse>;

/**
 * Messaging namespace for CorePluginContext
 * Provides inter-plugin messaging capabilities
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
 * AI namespace for CorePluginContext
 * Provides AI query capabilities
 */
export interface IAINamespace {
  /** Query the AI with optional context */
  query: (
    prompt: string,
    context?: Record<string, unknown>,
  ) => Promise<DefaultQueryResponse>;
}

/**
 * Identity namespace for CorePluginContext
 * Provides access to brain identity and profile information
 */
export interface IIdentityNamespace {
  /** Get the brain's identity configuration */
  get: () => IdentityBody;

  /** Get the owner's profile */
  getProfile: () => ProfileBody;

  /** Get app metadata (version, model, plugins) */
  getAppInfo: () => Promise<AppInfo>;
}

/**
 * Conversations namespace for CorePluginContext
 * Provides read-only access to conversations
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
 * Core plugin context - provides basic services to core plugins
 *
 * ## Method Naming Conventions
 * - Properties: Direct access to services/values (e.g., `logger`, `entityService`)
 * - `get*`: Retrieve existing data (e.g., `getIdentity`, `getConversation`)
 * - `register*`: Register handlers/templates (e.g., `registerTemplates`)
 * - Action verbs: Operations with side effects (e.g., `sendMessage`, `query`)
 */
export interface CorePluginContext {
  // ============================================================================
  // Plugin Identity
  // ============================================================================

  /** Unique plugin identifier */
  readonly pluginId: string;

  /** Logger instance for this plugin */
  readonly logger: Logger;

  /** Data directory for storing entity files */
  readonly dataDir: string;

  // ============================================================================
  // Entity Service (Read-Only)
  // ============================================================================

  /** Core entity service with read-only operations */
  readonly entityService: ICoreEntityService;

  // ============================================================================
  // Brain Identity & Profile
  // ============================================================================

  /**
   * Identity namespace for brain identity and profile
   * - `identity.get()` - Get the brain's identity configuration
   * - `identity.getProfile()` - Get the owner's profile
   * - `identity.getAppInfo()` - Get app metadata (version, model, plugins)
   */
  readonly identity: IIdentityNamespace;

  // ============================================================================
  // Inter-Plugin Messaging
  // ============================================================================

  /**
   * Messaging namespace for inter-plugin communication
   * - `messaging.send()` - Send a message to other plugins
   * - `messaging.subscribe()` - Subscribe to messages on a channel
   */
  readonly messaging: IMessagingNamespace;

  // ============================================================================
  // Template Operations
  // ============================================================================

  /**
   * Template operations namespace
   * - `templates.register()` - Register templates for this plugin
   * - `templates.format()` - Format data using a template formatter
   * - `templates.parse()` - Parse content using a template parser
   */
  readonly templates: ITemplatesNamespace;

  // ============================================================================
  // AI Operations
  // ============================================================================

  /**
   * AI operations namespace
   * - `ai.query()` - Query the AI with optional context
   */
  readonly ai: IAINamespace;

  // ============================================================================
  // Job Monitoring (Read-Only)
  // ============================================================================

  /** Namespaced job operations */
  readonly jobs: IJobsNamespace;

  // ============================================================================
  // Conversations (Read-Only)
  // ============================================================================

  /**
   * Conversations namespace for read-only conversation access
   * - `conversations.get()` - Get a conversation by ID
   * - `conversations.search()` - Search conversations by query
   * - `conversations.getMessages()` - Get messages from a conversation
   */
  readonly conversations: IConversationsNamespace;
}

/**
 * Create a CorePluginContext from the shell
 */
export function createCorePluginContext(
  shell: IShell,
  pluginId: string,
): CorePluginContext {
  const messageBus = shell.getMessageBus();
  const contentService = shell.getContentService();
  const entityService = shell.getEntityService();
  const logger = shell.getLogger().child(pluginId);

  // Create a MessageSender that uses the messageBus
  const sendMessage: MessageSender = async (channel, message, options) => {
    return messageBus.send(
      channel,
      message,
      pluginId,
      undefined, // target
      undefined, // metadata
      options?.broadcast,
    );
  };

  return {
    pluginId,
    logger,
    entityService,

    // Identity namespace
    identity: {
      get: () => shell.getIdentity(),
      getProfile: () => shell.getProfile(),
      getAppInfo: () => shell.getAppInfo(),
    },

    // Messaging namespace
    messaging: {
      send: sendMessage,
      subscribe: <T = unknown, R = unknown>(
        channelOrName: string | Channel<T, R>,
        handler: MessageHandler<T, R> | TypedMessageHandler<T, R>,
      ): (() => void) => {
        // Channel-based subscription (typed)
        if (isChannel(channelOrName)) {
          const channel = channelOrName;
          const typedHandler = handler as TypedMessageHandler<T, R>;

          // Wrap the typed handler to validate payload and extract it
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

            // Call the typed handler with validated payload and base message
            const { payload: _payload, ...baseMessage } = message;
            return typedHandler(parseResult.data as T, baseMessage);
          };

          return messageBus.subscribe(channel.name, wrappedHandler);
        }

        // String-based subscription (existing behavior)
        return messageBus.subscribe(
          channelOrName,
          handler as MessageHandler<T, R>,
        );
      },
    },

    // Template operations namespace
    templates: {
      register: (templates: Record<string, Template>): void => {
        shell.registerTemplates(templates, pluginId);
      },
      format: <T = unknown>(
        templateName: string,
        data: T,
        options?: { truncate?: number },
      ): string => {
        return contentService.formatContent(templateName, data, {
          ...options,
          pluginId,
        });
      },
      parse: <T = unknown>(templateName: string, content: string): T => {
        return contentService.parseContent(templateName, content, pluginId);
      },
    },

    // AI operations namespace
    ai: {
      query: (
        prompt: string,
        context?: Record<string, unknown>,
      ): Promise<DefaultQueryResponse> => {
        return shell.query(prompt, context);
      },
    },

    // Job operations - pass through shell.jobs namespace
    jobs: shell.jobs,

    // Conversations namespace (read-only)
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

    // Data directory
    dataDir: shell.getDataDir(),
  };
}
