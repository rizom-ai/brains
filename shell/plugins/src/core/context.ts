import type { IShell } from "../interfaces";
import type { DefaultQueryResponse } from "@brains/utils";
import type { Logger } from "@brains/utils";
import type { MessageHandler, MessageSender } from "@brains/messaging-service";
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
import type { IJobsNamespace } from "@brains/job-queue";

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

  /** Get the brain's identity configuration */
  getIdentity: () => IdentityBody;

  /** Get the owner's profile */
  getProfile: () => ProfileBody;

  /** Get app metadata (version, model, plugins) */
  getAppInfo: () => Promise<AppInfo>;

  // ============================================================================
  // Inter-Plugin Messaging
  // ============================================================================

  /** Send a message to other plugins */
  sendMessage: MessageSender;

  /** Subscribe to messages on a channel */
  subscribe: <T = unknown, R = unknown>(
    channel: string,
    handler: MessageHandler<T, R>,
  ) => () => void;

  // ============================================================================
  // Template Operations
  // ============================================================================

  /** Format data using a template formatter */
  formatContent: <T = unknown>(
    templateName: string,
    data: T,
    options?: { truncate?: number },
  ) => string;

  /** Parse content using a template parser */
  parseContent: <T = unknown>(templateName: string, content: string) => T;

  /** Register templates for this plugin */
  registerTemplates: (templates: Record<string, Template>) => void;

  // ============================================================================
  // AI Query
  // ============================================================================

  /** Query the AI with optional context */
  query: (
    prompt: string,
    context?: Record<string, unknown>,
  ) => Promise<DefaultQueryResponse>;

  // ============================================================================
  // Job Monitoring (Read-Only)
  // ============================================================================

  /** Namespaced job operations */
  readonly jobs: IJobsNamespace;

  // ============================================================================
  // Conversations (Read-Only)
  // ============================================================================

  /** Get a conversation by ID */
  getConversation: (conversationId: string) => Promise<Conversation | null>;

  /** Search conversations by query */
  searchConversations: (query: string) => Promise<Conversation[]>;

  /** Get messages from a conversation */
  getMessages: (
    conversationId: string,
    options?: GetMessagesOptions,
  ) => Promise<Message[]>;
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

    // Identity and Profile
    getIdentity: () => shell.getIdentity(),
    getProfile: () => shell.getProfile(),

    // App metadata
    getAppInfo: () => shell.getAppInfo(),

    // Messaging
    sendMessage,
    subscribe: <T = unknown, R = unknown>(
      channel: string,
      handler: MessageHandler<T, R>,
    ) => messageBus.subscribe(channel, handler),

    // Template operations using ContentGenerator
    formatContent: <T = unknown>(
      templateName: string,
      data: T,
      options?: { truncate?: number },
    ): string => {
      return contentService.formatContent(templateName, data, {
        ...options,
        pluginId,
      });
    },

    parseContent: <T = unknown>(templateName: string, content: string): T => {
      return contentService.parseContent(templateName, content, pluginId);
    },

    registerTemplates: (templates: Record<string, Template>): void => {
      shell.registerTemplates(templates, pluginId);
    },

    // Query functionality
    query: (
      prompt: string,
      context?: Record<string, unknown>,
    ): Promise<DefaultQueryResponse> => {
      return shell.query(prompt, context);
    },

    // Job operations - pass through shell.jobs namespace
    jobs: shell.jobs,

    // Conversation service (read-only)
    getConversation: async (
      conversationId: string,
    ): Promise<Conversation | null> => {
      const conversationService = shell.getConversationService();
      return conversationService.getConversation(conversationId);
    },
    searchConversations: async (query: string): Promise<Conversation[]> => {
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

    // Data directory
    dataDir: shell.getDataDir(),
  };
}
