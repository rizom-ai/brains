import type {
  MessageHandler,
  MessageSender,
  MessageResponse,
  BaseMessage,
} from "@brains/messaging-service";
import type { MessageCollector } from "../contracts/messaging";
import type { Channel } from "../utils/channels";
import type { ENTITY_CHANNELS } from "@brains/contracts";
import type {
  GetMessagesOptions,
  ListConversationsOptions,
} from "@brains/conversation-service";
import type { Conversation, Message } from "../contracts/conversations";
import type { AnchorProfile, BrainCharacter } from "../contracts/identity";
import type { AppInfo } from "../contracts/app-info";
import type {
  ProfileKindDefinition,
  ResolvedProfileSelection,
} from "@brains/identity-service";
import type { EvalHandler } from "../contracts/handlers";
import type { z } from "@brains/utils/zod";
import type { AnalyticsReportDefinition } from "../contracts/analytics";
import type { EntityAction, UserPermissionLevel } from "@brains/templates";
import type {
  ChannelDeliveryProvider,
  ChannelDescriptor,
} from "../channel-registry";
import type { InboxSource } from "../inbox-registry";
import type {
  InboxFollowUpKindRegistration,
  InboxFollowUpResolutionInput,
  RegisteredInboxFollowUpKind,
  ResolvedInboxFollowUp,
} from "../inbox-follow-up-registry";
import type { OperationalHealthProvider } from "../operational-health-registry";

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
/** The entity and embedding events every process of the runtime raises. */
type EntityChannel = (typeof ENTITY_CHANNELS)[keyof typeof ENTITY_CHANNELS];

export interface IMessagingNamespace {
  /** Send a message to other plugins */
  send: MessageSender;

  /**
   * Send a message and gather one answer from every subscriber. For
   * contributions read when they are used, such as the head scripts a site
   * build asks for: it works in every process and in any registration order.
   */
  collect: MessageCollector;

  /**
   * Subscribe to messages on a channel in this process.
   *
   * Entity and embedding events are refused: every process of the runtime
   * raises them, so a subscription hears only part of them. Use observe for
   * what the web process owns, subscribeExecution for work each process does
   * for its own changes.
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
    <T = unknown, R = unknown, C extends string = string>(
      channel: C extends EntityChannel ? never : C,
      handler: MessageHandler<T, R>,
    ): () => void;

    // Channel-based (typed, with auto-validation)
    <TPayload, TResponse = unknown>(
      channel: Channel<TPayload, TResponse>,
      handler: TypedMessageHandler<TPayload, TResponse>,
    ): () => void;
  };

  /**
   * Subscribe in every process, each handling the messages it raises itself:
   * for work tied to where an event happens, such as the job that follows an
   * embedding the worker made.
   */
  subscribeExecution: <T = unknown, R = unknown>(
    channel: string,
    handler: MessageHandler<T, R>,
  ) => () => void;

  /**
   * Follow a channel from the web process, hearing what every process of the
   * runtime raises: for caches, views and work the web process owns, such as
   * publishing or exporting a change wherever it was made. A worker owns none
   * of these, so it observes nothing.
   */
  observe: <T = unknown, R = unknown>(
    channel: string,
    handler: MessageHandler<T, R>,
  ) => () => void;
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

/** App-scoped semantic profile-kind catalog. */
export interface IProfileKindsNamespace {
  /** Register one possible kind during plugin registration. */
  register(definition: ProfileKindDefinition): void;

  /** Read the immutable selected kind after registration finalization. */
  getResolved(): ResolvedProfileSelection;

  /** Read the selected definition, including its field schema. */
  getSelectedDefinition(): ProfileKindDefinition | undefined;
}

/** Read-only app-scoped channel metadata and delivery providers. */
export interface IChannelsNamespace {
  listDescriptors(): ChannelDescriptor[];
  getDescriptor(channelType: string): ChannelDescriptor | undefined;
  getDeliveryProvider(channelType: string): ChannelDeliveryProvider | undefined;
}

/** Channel registration capability exposed only to message-interface plugins. */
export interface IMessageInterfaceChannelsNamespace extends IChannelsNamespace {
  registerDescriptor(descriptor: ChannelDescriptor): void;
  registerDeliveryProvider(provider: ChannelDeliveryProvider): void;
}

/** App-scoped inbox source registration and finalized read access. */
export interface IInboxNamespace {
  registerSource(source: InboxSource): void;
  listSources(): InboxSource[];
  getSource(sourceId: string): InboxSource | undefined;
}

/** Request-driven plugin contributions to operational (not routing) health. */
export interface IOperationalHealthNamespace {
  register(name: string, provider: OperationalHealthProvider): () => void;
}

/** Destination-owned Inbox follow-up registration and finalized resolution. */
export interface IInboxFollowUpsNamespace {
  registerKind(registration: InboxFollowUpKindRegistration): void;
  listKinds(): RegisteredInboxFollowUpKind[];
  getKind(kind: string): RegisteredInboxFollowUpKind | undefined;
  resolve(
    input: Omit<InboxFollowUpResolutionInput, "context">,
  ): Promise<ResolvedInboxFollowUp[]>;
  resolveUniversal(
    input: Omit<InboxFollowUpResolutionInput, "context">,
  ): Promise<ResolvedInboxFollowUp[]>;
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
 * Analytics namespace — add reports to `system_analytics`
 */
export interface IAnalyticsNamespace {
  /** Register a report; one with the same type replaces it */
  register: <TParams extends z.ZodObject>(
    definition: AnalyticsReportDefinition<TParams>,
  ) => void;
}

export interface IPermissionsNamespace {
  /** Assert that the caller can perform an entity action. */
  assertEntityActionAllowed(
    entityType: string,
    action: EntityAction,
    context: { userPermissionLevel?: UserPermissionLevel | undefined },
  ): void;
}

export interface IPluginsNamespace {
  /** Whether a plugin is part of the resolved runtime. */
  has(pluginId: string): boolean;
}

export interface IEndpointsNamespace {
  /** Register a user-facing URL for this plugin */
  register(endpoint: {
    label: string;
    url: string;
    priority?: number;
    visibility?: UserPermissionLevel;
    requiresActiveSession?: boolean;
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
    requiresActiveSession?: boolean;
    status?: "available" | "coming-soon" | "disabled";
  }): void;
}
