import type {
  MessageHandler,
  MessageSender,
  MessageResponse,
  BaseMessage,
} from "@brains/messaging-service";
import type { Channel } from "../utils/channels";
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
import type { EvalHandler, InsightHandler } from "../interfaces";
import type { EntityAction, UserPermissionLevel } from "@brains/templates";
import type {
  ChannelDeliveryProvider,
  ChannelDescriptor,
} from "../channel-registry";
import type { InboxSource } from "../inbox-registry";

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
