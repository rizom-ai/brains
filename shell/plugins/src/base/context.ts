import type { IShell } from "../interfaces";
import { type Logger } from "@brains/utils";
import { derivePreviewDomain } from "@brains/site-composition";
import type {
  MessageHandler,
  MessageSender,
  MessageResponse,
  BaseMessage,
} from "@brains/messaging-service";
import type { Channel } from "../utils/channels";
import type { ICoreEntityService } from "@brains/entity-service";
import type { InsightHandler } from "../interfaces";
import type {
  GetMessagesOptions,
  ListConversationsOptions,
} from "@brains/conversation-service";
import type { Conversation, Message } from "../contracts/conversations";
import type { AnchorProfile, BrainCharacter } from "../contracts/identity";
import type { EvalHandler, PluginRegistrationContext } from "../interfaces";
import type { AppInfo } from "../contracts/app-info";
import type { UserPermissionLevel } from "@brains/templates";
import type { EntityDisplayEntry } from "../types/routes";
import type { JobsNamespace } from "@brains/job-queue";
import {
  createAppInfoGetter,
  createConversationsNamespace,
  createEndpointsNamespace,
  createEvalNamespace,
  createIdentityNamespace,
  createInsightsNamespace,
  createInteractionsNamespace,
  createJobsNamespace,
  createMessagingNamespace,
} from "./namespaces";

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

  /** List conversations, newest active first */
  list: (options?: ListConversationsOptions) => Promise<Conversation[]>;

  /** Get messages from a conversation */
  getMessages: (
    conversationId: string,
    options?: GetMessagesOptions,
  ) => Promise<Message[]>;

  /** Count messages in a conversation without loading them */
  countMessages: (conversationId: string) => Promise<number>;
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

  /** Preview site URL derived from domain (e.g. "https://preview.yeehaa.io" or "https://preview.recall.rizom.ai"), undefined if no domain */
  readonly previewUrl: string | undefined;

  /** Entity display metadata from the active site package, if any */
  readonly entityDisplay: Record<string, EntityDisplayEntry> | undefined;

  /** Shared conversation spaces for this brain/team */
  readonly spaces: string[];

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

  /**
   * Interactions namespace — advertise user/agent entry points for this brain.
   */
  readonly interactions: IInteractionsNamespace;
}

export interface IEndpointsNamespace {
  /** Register a user-facing URL for this plugin */
  register(endpoint: {
    label: string;
    url: string;
    priority?: number;
    visibility?: UserPermissionLevel;
  }): void;
}

export interface IInteractionsNamespace {
  /** Register a user or agent-facing way to interact with this brain */
  register(interaction: {
    id: string;
    label: string;
    description?: string;
    href: string;
    kind: "human" | "agent" | "admin" | "protocol";
    priority?: number;
    visibility?: UserPermissionLevel;
    status?: "available" | "coming-soon" | "disabled";
  }): void;
}

/**
 * Create a BasePluginContext from the shell.
 *
 * Used by all three sibling context factories (entity, service, interface).
 */
export function createBasePluginContext(
  shell: IShell,
  pluginId: string,
  registrationContext?: PluginRegistrationContext,
): BasePluginContext {
  const entityService = shell.getEntityService();
  const logger = shell.getLogger().child(pluginId);
  const domain = shell.getDomain();
  const getAppInfo = createAppInfoGetter(shell);

  return {
    pluginId,
    logger,
    entityService,

    identity: createIdentityNamespace(shell, getAppInfo),

    appInfo: getAppInfo,

    domain,
    siteUrl: domain ? `https://${domain}` : undefined,
    previewUrl: domain ? `https://${derivePreviewDomain(domain)}` : undefined,
    entityDisplay: registrationContext?.entityDisplay,
    spaces: shell.getSpaces(),

    messaging: createMessagingNamespace(shell, pluginId, logger),

    jobs: createJobsNamespace(shell, pluginId),

    conversations: createConversationsNamespace(shell),

    dataDir: shell.getDataDir(),

    eval: createEvalNamespace(shell, pluginId),

    insights: createInsightsNamespace(shell),

    endpoints: createEndpointsNamespace(shell, pluginId),
    interactions: createInteractionsNamespace(shell, pluginId),
  };
}
