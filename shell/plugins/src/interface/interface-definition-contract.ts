import type { z } from "@brains/utils/zod";
import type { SdkErrorCode } from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";
import type {
  AccountSettingsValue,
  AnyAccountSettingsDefinition,
} from "../operator/account-settings-definition-contract";
import type {
  AnyServiceJobDefinition,
  AnyServiceToolDefinition,
  ServiceLifecycle,
} from "../service/service-definition-contract";
import type { SubscriptionRequester } from "../contracts/subscription";
import type { IAuthRegistry } from "../contracts/auth-registry";
import type { IMCPTransport } from "../interfaces";
import type { AgentNamespace } from "../contracts/agent";
import type { JobProgressEvent } from "@brains/job-queue";
import type { ResponseRenderDirective } from "../message-interface/response-render-plan";
import type { IPermissionsNamespace } from "../public/types";
import type { IInterfaceConversationsNamespace } from "./context";
import type {
  IInboxFollowUpsNamespace,
  IInboxNamespace,
} from "../base/context-types";
import type {
  ConsoleSurface,
  SurfacePermissionLevel,
} from "../console-surfaces";
import type { JobEntityAccess } from "../job/job-context-contract";
import type { AnchorProfile, BrainCharacter } from "../contracts/identity";
import type { ResolvedProfileSelection } from "@brains/identity-service";
import type { ToolInfo } from "@brains/mcp-service";
import type { PublicSkill } from "../a2a/public-skills";
import type {
  RuntimeUploadScopeOptions,
  ScopedRuntimeUploadStore,
} from "../service/upload-registry";
import type {
  IEndpointsNamespace,
  IInteractionsNamespace,
  IPluginsNamespace,
} from "../base/context-types";
import type {
  ChannelDeliverySensitivity,
  ChannelDeliveryThreading,
  ChannelSubjectPattern,
} from "../channel-registry";
import type {
  IRuntimeStateStore,
  RuntimeStateScopeOptions,
} from "@brains/runtime-state";

// The route vocabulary lives in a leaf, because services declare routes too
// and the two definition contracts import each other's job types. It stays
// re-exported here, where interface authors read it.
import type {
  AnyInterfaceRouteDefinition,
  RoutePermissions,
} from "./route-contract";

export { routeMethods, verbatim } from "./route-contract";
export type {
  AnyInterfaceRouteDefinition,
  InterfaceActor,
  InterfaceCaller,
  InterfaceRouteDefinition,
  InterfaceRouteInput,
  InterfaceSchema,
  ProtocolSecurityDefinition,
  PublicSecurityDefinition,
  RouteBody,
  RouteCaller,
  RoutePermissions,
  RouteMethod,
  RouteSecurity,
  RouteOutput,
  RouteResponse,
  VerbatimResponse,
} from "./route-contract";

/**
 * Somewhere to put bytes that arrived from outside.
 *
 * An interface accepting an attachment has to keep the file where the agent
 * can read it back, where it survives a restart, and where the client can
 * fetch it at a URL. That is `runtimeState`'s reason, for content rather than
 * bookkeeping, and it arrives the same way: the declaration names a scope and
 * the runtime owns the store — including retention, so nothing accumulates
 * forever.
 *
 * Scoped rather than shared: a ref means something only in the scope that
 * issued it, and two interfaces accepting attachments must not be able to
 * read each other's.
 * Named consumers: @brains/web-chat, @brains/chat.
 */
export type InterfaceUploads = (
  options: RuntimeUploadScopeOptions,
) => ScopedRuntimeUploadStore;

/**
 * Reading a record, and only reading it.
 *
 * Exactly one method, because exactly one thing needs it: a page that renders
 * an attachment has to fetch the entity the conversation named. An interface
 * declares no entity types, so there is no set a write could be checked
 * against — one that wanted to write would be a service.
 */
/**
 * Reads only: an interface owns no types. `listEntities` and
 * `getEntityTypes` joined `getEntity` for a directory of approved peers and
 * the check that the type it lists exists at all. Named consumer: @brains/a2a.
 */
export type InterfaceEntityReader = Pick<
  JobEntityAccess,
  "getEntity" | "listEntities" | "getEntityTypes"
>;

export type InterfaceConfigSchema = z.ZodType<object, object>;
export type MessageRecipientSchema = z.ZodType<unknown, unknown>;

export interface InterfaceJobReference {
  readonly id: string;
}

/**
 * How work someone started is going.
 *
 * Narrower than what a service reads about its own jobs: an interface did not
 * declare the job and cannot say what its result means, so it gets what a page
 * can honestly show — whether it is still running, and what went wrong if it
 * did not. Named consumer: @brains/web-chat.
 */
export interface InterfaceJobStatus {
  readonly id: string;
  readonly status: string;
  readonly lastError: string | null;
  readonly code?: SdkErrorCode | undefined;
}

export interface InterfaceJobs {
  enqueue<TDefinition extends AnyServiceJobDefinition>(
    definition: TDefinition,
    input: z.input<TDefinition["input"]>,
  ): Promise<InterfaceJobReference>;
  getStatus(jobId: string): Promise<InterfaceJobStatus | null>;
}

export interface InterfaceDaemonHealth {
  ready(): void;
  warning(message: string): void;
}

export interface InterfaceDaemonDefinition {
  readonly kind: "rizom-interface-daemon";
  readonly id: string;
  readonly required: boolean;
  readonly forAccounts?: undefined;
  run(context: {
    readonly signal: AbortSignal;
    readonly health: InterfaceDaemonHealth;
  }): Promise<void>;
  /**
   * Health asked for, rather than announced.
   *
   * `ready` and `warning` are pushed at moments the daemon chooses, which
   * cannot express a state that changes underneath it — a mailbox listener is
   * connected or reconnecting right now, and only it knows. Answering here
   * overrides the pushed status. Named consumer: @brains/email.
   */
  check?(): InterfaceDaemonReport | Promise<InterfaceDaemonReport>;
}

export interface InterfaceDaemonReport {
  readonly status: "healthy" | "warning" | "error";
  readonly message: string;
}

export interface AccountInterfaceDaemonDefinition<
  TAccountSettings extends AnyAccountSettingsDefinition =
    AnyAccountSettingsDefinition,
> {
  readonly kind: "rizom-interface-daemon";
  readonly id: string;
  readonly required: boolean;
  readonly forAccounts: TAccountSettings;
  run(context: {
    readonly account: {
      readonly id: string;
      readonly settings: AccountSettingsValue<TAccountSettings>;
    };
    readonly signal: AbortSignal;
    readonly health: InterfaceDaemonHealth;
  }): Promise<void>;
}

export type AnyInterfaceDaemonDefinition =
  InterfaceDaemonDefinition | AccountInterfaceDaemonDefinition;

/**
 * What every interface can ask for at registration.
 *
 * Both families get this. They are the same kind of thing — a way in — and the
 * runtime never distinguished them: `MessageInterfacePluginContext` has
 * extended `InterfacePluginContext` all along. Only the declared contracts had
 * drifted, each growing what its first consumer happened to need, so a chat
 * channel that also serves a console could not ask for auth and a protocol
 * host could not keep a cursor. Nothing designed that split.
 */
export interface InterfaceSetupContext<
  TConfigSchema extends InterfaceConfigSchema,
> {
  readonly config: z.output<TConfigSchema>;
  /**
   * Whether another package is part of this deployment. An interface
   * that mounts on the shared HTTP host cannot answer without it, and
   * that is knowable at registration rather than at the first request.
   */
  readonly plugins: IPluginsNamespace;
  /** Where this interface can be reached, for the Endpoints card. */
  readonly endpoints: IEndpointsNamespace;
  /** The same address as a way in, for a person rather than a client. */
  readonly interactions: IInteractionsNamespace;
  /** Where the running auth implementation is published. */
  readonly auth: IAuthRegistry;
  /**
   * What a caller arriving over this transport may do. A protocol host
   * resolves that once, from the transport rather than from a person —
   * stdio is whoever runs the process, so the two transport questions come
   * alongside the entity assertion every family gets.
   * Named consumer: @brains/mcp.
   */
  readonly permissions: IPermissionsNamespace & RoutePermissions;
  /**
   * The thing that answers.
   *
   * An interface is how someone reaches the brain, so the tools it offers of
   * its own are conversational: `chat` asks, `confirm` answers a question the
   * brain asked back. Named consumer: @brains/mcp.
   */
  readonly agent: AgentNamespace;
  /** Release resources after shutdown or failed registration, in reverse order. */
  readonly lifecycle: Pick<ServiceLifecycle, "onCleanup">;
  /**
   * Bookkeeping that has to survive a restart.
   *
   * An interface that reads a mailbox remembers how far it got, and without
   * that it re-reads everything on every boot. Scoped by namespace under this
   * interface's id and validated by a schema. Named `runtimeState` rather than
   * `state` because `state` already means what setup returns.
   */
  readonly runtimeState: <TValue, TInput = TValue>(
    options: RuntimeStateScopeOptions<TValue, TInput>,
  ) => IRuntimeStateStore<TValue, TInput>;
  readonly uploads: InterfaceUploads;
  /**
   * The conversations this interface hosts.
   *
   * An interface that carries a conversation is not only a pipe for one turn:
   * it lists the threads someone has, reads a history back, renames and
   * deletes. That is the surface, and a declaration reached it by indexing
   * the runtime context type — which is what having no name for it looks
   * like. Named consumers: @brains/web-chat, @brains/chat.
   */
  readonly conversations: IInterfaceConversationsNamespace;
  /**
   * Reading a record the conversation points at.
   *
   * A rendered attachment names an entity, and the page has to fetch it. A
   * read, not the entity service: an interface owns no types, and one that
   * wanted to write would be a service.
   * Named consumer: @brains/web-chat.
   */
  readonly entities: InterfaceEntityReader;
  /**
   * How the brain presents itself to a peer: who it is, whose it is, what
   * kind of profile it represents, and what it offers publicly. Reads the
   * runtime already answers, gathered here because an interface that
   * publishes an Agent Card has to describe the brain rather than itself.
   * Named consumer: @brains/a2a.
   */
  readonly identity: {
    get(): BrainCharacter;
    getProfile(): AnchorProfile;
  };
  readonly profileKinds: { getResolved(): ResolvedProfileSelection };
  readonly tools: {
    listForPermissionLevel(level: UserPermissionLevel): ToolInfo[];
  };
  readonly publicSkills: { list(): Promise<PublicSkill[]> };
  /**
   * The channels whose traffic the brain records without spending a turn.
   *
   * A space is somebody else's room the brain is in: chat captures what is
   * said there into a space conversation, and has to know which rooms those
   * are. Named consumer: @brains/chat.
   */
  readonly spaces: readonly string[];
  /**
   * The other doors this caller should be shown.
   *
   * A console renders a strip of links to the rest of the brain. It used to
   * build that by reading the whole mounted route table and matching plugin
   * ids against a list — which is a package knowing another package's routes,
   * the thing this plan removes. The runtime knows which surfaces are mounted
   * and what each requires; a console says who is asking.
   * Named consumer: @brains/web-chat.
   */
  readonly surfaces: (options: {
    readonly permissionLevel?: SurfacePermissionLevel | undefined;
    readonly hasActiveSession?: boolean | undefined;
    /**
     * Where this console's own door is. A surface always lists itself,
     * whatever the caller's level — they reached it through its own gate —
     * but only the declaration knows the path it configured.
     */
    readonly selfHref?: string | undefined;
  }) => readonly ConsoleSurface[];
  /**
   * What arrived that someone still has to deal with, and where a follow-up
   * can be continued.
   *
   * A console offers to carry an inbox item into a conversation, which means
   * registering that it can and reading the source to check the item is
   * still reachable. Named consumer: @brains/web-chat.
   */
  readonly inbox: IInboxNamespace;
  readonly inboxFollowUps: IInboxFollowUpsNamespace;
  /** The brain's own domain, when it has one. */
  readonly domain: string | undefined;
  /**
   * The URL this brain's own links are addressed by, right now.
   *
   * `domain` says what the brain is called; this says where its pages
   * currently are, which differs while a runtime is asked to prefer local
   * URLs. An interface resolving an artifact link back to its entity has to
   * agree with whatever wrote the link, so the runtime decides once rather
   * than each package re-deriving it from three fields.
   */
  readonly displayBaseUrl: string | undefined;
  /**
   * The brain's theme, for an interface that serves a page of its own.
   *
   * web-chat and the console it hosts are the brain's own surfaces and should
   * look like it; getting the stylesheet another way would mean picking a
   * theme the rest of the brain is not using.
   */
  readonly themeCSS: string;
  readonly logger: Logger;
}

/**
 * A generic interface: what it is and what it sets up, then what it serves.
 *
 * Two arguments, so the state `setup` returns is fixed before the second
 * is checked and its slots read `state` in any order.
 */
export interface InterfaceDefinitionHeader<
  TConfigSchema extends InterfaceConfigSchema,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TState extends object = Record<never, never>,
> {
  readonly id: string;
  readonly config: TConfigSchema;
  readonly accountSettings?: TAccountSettings | undefined;
  /**
   * What this interface holds while it runs, and what it does once, at
   * registration.
   *
   * An interface that hosts a protocol has both: a transport built once and
   * answered through by every route, and a refusal to start at all when the
   * host it mounts on is absent. Throwing here fails registration, which is
   * the honest outcome — an interface that cannot serve should not appear to.
   * Named consumer: @brains/mcp.
   */
  readonly setup?:
    | ((
        context: InterfaceSetupContext<TConfigSchema> & {
          /**
           * The runtime's server for the protocol this interface hosts.
           *
           * The tools and resources every package registered are already on
           * it; what an interface adds is a transport to reach them over, and
           * the mode and permission level that transport confers. Only this
           * family: a protocol host is what one is.
           * Named consumer: @brains/mcp.
           */
          readonly mcpTransport: IMCPTransport;
        },
      ) => TState | Promise<TState>)
    | undefined;
}

/**
 * A generic interface: what it is and what it sets up, then what it serves.
 *
 * Two arguments, so the state `setup` returns is fixed before the second
 * is checked and its slots read `state` in any order.
 */
export interface InterfaceDefinitionBehavior<
  TConfigSchema extends InterfaceConfigSchema,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TState extends object = Record<never, never>,
> {
  /**
   * Requests this interface answers on the message bus.
   * Message interfaces already declared these; a plain interface can be the
   * only thing that knows how to do something too — Studio asks the A2A
   * interface to call a peer. Named consumer: @brains/a2a.
   */
  readonly subscriptions?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
      }) => readonly AnySubscriptionDefinition[])
    | undefined;
  /**
   * How the agent should use what this interface offers. Plain text the
   * agent reads directly, the same slot a service has. Named consumer:
   * @brains/a2a, whose call tool needs telling when and how to reach for it.
   */
  readonly instructions?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
      }) => string)
    | undefined;
  /**
   * Tools this interface offers of its own.
   *
   * Not the tools it serves — those come from every other package — but the
   * ones that only make sense through it: `chat` and `confirm` are how a
   * protocol client holds a conversation, and they have no meaning without
   * a client on the other end. Named consumer: @brains/mcp.
   */
  readonly tools?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
      }) => readonly AnyServiceToolDefinition[])
    | undefined;
  readonly routes?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        readonly jobs: InterfaceJobs;
      }) => readonly AnyInterfaceRouteDefinition[])
    | undefined;
  readonly daemons?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        readonly jobs: InterfaceJobs;
      }) => readonly (
        | InterfaceDaemonDefinition
        | (TAccountSettings extends AnyAccountSettingsDefinition
            ? AccountInterfaceDaemonDefinition<TAccountSettings>
            : never)
      )[])
    | undefined;
}

/** The header and the behavior, as the runtime reads them. */
export type InterfaceDefinitionInput<
  TConfigSchema extends InterfaceConfigSchema,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TState extends object = Record<never, never>,
> = InterfaceDefinitionHeader<TConfigSchema, TAccountSettings, TState> &
  InterfaceDefinitionBehavior<TConfigSchema, TAccountSettings, TState>;

export interface MessageChannelDefinition<
  TRecipientSchema extends MessageRecipientSchema,
> {
  readonly type: string;
  readonly displayName: string;
  readonly subjectLabel: string;
  /**
   * What a valid subject on this channel looks like.
   *
   * `recipient` types the payload a caller hands `deliver`; this validates the
   * subject a person types. An email channel accepts an address and nothing
   * else, and the runtime should refuse the rest before a delivery is
   * attempted. Named consumer: @brains/email.
   */
  readonly subjectPattern?: ChannelSubjectPattern | undefined;
  readonly recipient: TRecipientSchema;
  /**
   * How a conversation on this channel is keyed.
   *
   * Default `"derived"`: the runtime keys it `<type>:<channel>:<thread>`,
   * because a room id from somebody else's service means nothing on its own
   * and two services can name a room the same thing.
   *
   * `"channel"` says the interface mints its own session keys and hands them
   * out — web-chat gives the browser an id and gets it back on the next turn,
   * having already gated the caller against the conversation stored under it.
   * Prefixing that would key a second conversation beside the one it checked.
   * Named consumer: @brains/web-chat.
   *
   * A function says how this interface already keys them. chat's Discord
   * threads hold conversations keyed `discord-<thread>`, written by the class
   * it converted away from; the derived key would start every live thread
   * over, with its history and pending approvals orphaned under the old one.
   * Named consumer: @brains/chat.
   */
  readonly conversationKey?:
    "derived" | "channel" | ((channel: MessageChannel) => string) | undefined;
}

// A subscription is not an interface concept — a service answers requests on
// the bus too — so it lives in contracts/ and both families name it there.
import type { AnySubscriptionDefinition } from "../contracts/subscription";
import type { ToolStatusUpdate } from "../message-interface/tool-status";
import type { UserPermissionLevel } from "@brains/templates";

export type {
  AnySubscriptionDefinition,
  SubscriptionDefinition,
} from "../contracts/subscription";

/** The narrow publish surface an interface gets, not the whole bus. */
export interface MessageInterfacePublisher {
  /** Ask, and read the answer — the same word every other surface uses. */
  readonly request: SubscriptionRequester;
}

export interface MessageOutput {
  readonly text: string;
}

/** An answer the interface posted itself, named so the runtime can track it. */
export interface PresentedMessage {
  readonly messageId: string;
}

/** The approval an answer resolved, and which way. */
export interface PresentedConfirmation {
  readonly approvalId: string;
  readonly approved: boolean;
  /**
   * The approvals still pending in the conversation once this one is
   * answered. An answer that says nothing about them leaves a channel that
   * listed several with no way to say which remain. Named consumer: @brains/chat.
   */
  readonly remaining: readonly string[];
}

/**
 * Everything a delivery carries, as opposed to what a chat message carries.
 *
 * `MessageOutput` is chat-shaped — a body and nothing else — because a chat
 * reply has nowhere to put a subject. A delivery does: it is addressed, it is
 * idempotent, it may thread, and it may be secret. Dropping those on the way
 * to `deliver` silently degrades an email to a bare body.
 */
export interface MessageDelivery {
  readonly subject: string;
  readonly text: string;
  readonly idempotencyKey: string;
  readonly html?: string | undefined;
  readonly sensitivity?: ChannelDeliverySensitivity | undefined;
  readonly threading?: ChannelDeliveryThreading | undefined;
}

/**
 * What a transport reports back.
 *
 * A string is the provider's id for the delivery. A transport that knows why
 * it failed returns the reason instead of throwing, which would otherwise be
 * flattened into one generic code.
 */
export type MessageDeliveryOutcome =
  | {
      readonly status: "sent";
      readonly providerDeliveryId?: string | undefined;
    }
  | { readonly status: "failed"; readonly failureCode: string };

export interface MessageChannel {
  readonly id: string;
  readonly threadId?: string | undefined;
  /**
   * What the room is called, when the interface knows.
   *
   * Recorded on the turn and the stored message in place of the interface's
   * display name: a chat interface tells a DM from a channel, and names the
   * channel. Named consumer: @brains/chat.
   */
  readonly name?: string | undefined;
}

export interface InboundMessageSender {
  readonly id: string;
  readonly displayName?: string | undefined;
}

export interface InboundMessageAttachment {
  readonly name: string;
  readonly mediaType: string;
  /**
   * Where to fetch it, for a channel that receives a link rather than the
   * thing. Omitted when the interface already holds the bytes.
   */
  readonly url?: string | undefined;
  /** The bytes, for an interface that already has them. */
  readonly data?: Uint8Array | undefined;
  /** The text, for the same reason, when the attachment is text. */
  readonly text?: string | undefined;
  /**
   * Where the interface put these bytes, when it kept them.
   *
   * An upload the person attached is stored, and the reference is how the
   * agent reaches it again in a later turn — and how a card showing it again
   * knows what to redact. Dropping it on the way in would leave the agent
   * holding bytes with no name for them.
   */
  readonly source?: { readonly kind: string; readonly id: string } | undefined;
}

/**
 * Who the interface established the caller to be, when it holds a verified
 * session rather than a sender id on someone else's service.
 *
 * Given this, the pipeline uses it instead of resolving a level from the
 * configured rules — which would answer "public" for a signed-in browser, as
 * no deployment writes a rule per browser user — and attributes the turn to
 * the person rather than an external stand-in.
 */
export interface AuthenticatedCaller {
  readonly permissionLevel: UserPermissionLevel;
  readonly isAnchor?: boolean | undefined;
  readonly userId?: string | undefined;
  readonly canonicalId?: string | undefined;
}

export interface ReceiveAuthenticatedInput {
  readonly sender: InboundMessageSender;
  readonly channel: MessageChannel;
  readonly text: string;
  /**
   * The id the sender's own client already gave this message.
   *
   * A browser mints one before it posts, and it is what ties the stored turn
   * to what the person is looking at. An interface whose messages arrive
   * without ids omits it and the runtime records none.
   */
  readonly messageId?: string | undefined;
  readonly caller?: AuthenticatedCaller | undefined;
  readonly attachments?:
    (() => Promise<readonly InboundMessageAttachment[]>) | undefined;
}

/**
 * An answer to a question the brain asked, from a client that knows which
 * question it is answering.
 *
 * `receiveAuthenticated` reads a reply as text and matches it against the
 * approvals it is holding, because a sentence is all a chat channel gives it.
 * A client with buttons already has the approval's id; writing that back into
 * a sentence for the runtime to parse out again can only lose.
 * Named consumer: @brains/web-chat.
 */
export interface ResolveApprovalInput {
  readonly sender: InboundMessageSender;
  readonly channel: MessageChannel;
  readonly approvalId: string;
  readonly approved: boolean;
  /** The client's id for the tool call, when it draws approvals as tools. */
  readonly toolCallId?: string | undefined;
  readonly caller?: AuthenticatedCaller | undefined;
}

/**
 * What became of it.
 *
 * `not-pending` is the one case a client cannot infer: it keeps resubmitting
 * an approval until the tool call it drew reaches a terminal state, so an
 * approval the brain has already resolved would leave that call open forever.
 * The text is the brain's own account of why.
 */
export type ApprovalOutcome =
  | { readonly kind: "resolved" }
  | { readonly kind: "not-pending"; readonly text: string };

export interface MessageReceiver {
  receiveAuthenticated(input: ReceiveAuthenticatedInput): Promise<void>;
  resolveApproval(input: ResolveApprovalInput): Promise<ApprovalOutcome>;
  /**
   * The approvals the runtime is still holding for this channel's
   * conversation.
   *
   * An interface that drew a button per approval is clicked on a stale one
   * long after it was answered. Asking first means it can say so at once,
   * rather than spending a turn on an approval nobody is waiting for.
   * Named consumer: @brains/chat.
   */
  pendingApprovals(channel: MessageChannel): Promise<readonly string[]>;
}

/**
 * A message interface: its channel and its setup, then how it talks.
 *
 * Two arguments, so the state `setup` returns is fixed before the second
 * is checked and its slots read `state` in any order.
 */
export interface MessageInterfaceDefinitionHeader<
  TConfigSchema extends InterfaceConfigSchema,
  TState extends object,
  TRecipientSchema extends MessageRecipientSchema,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> {
  readonly id: string;
  readonly config: TConfigSchema;
  readonly accountSettings?: TAccountSettings | undefined;
  readonly channel: MessageChannelDefinition<TRecipientSchema>;
  /**
   * What the interface holds while it runs, built once at registration.
   *
   * What this returns is the `state` every behavior slot reads. It sits in
   * the header, a separate argument, so the type is fixed before any of them
   * is checked — the order they are written in does not matter.
   */
  readonly setup?:
    | ((
        context: InterfaceSetupContext<TConfigSchema> & {
          /**
           * Handing on something that arrived from outside.
           *
           * A chat turn goes back through `messages.receiveAuthenticated`,
           * but not everything an interface receives is a turn — an inbound
           * email is an event other packages consume. Only this family:
           * carrying messages is what one is.
           * Named consumer: @brains/email.
           */
          readonly messaging: MessageInterfacePublisher;
        },
      ) => TState | Promise<TState>)
    | undefined;
}

/**
 * A message interface: its channel and its setup, then how it talks.
 *
 * Two arguments, so the state `setup` returns is fixed before the second
 * is checked and its slots read `state` in any order.
 */
export interface MessageInterfaceDefinitionBehavior<
  TConfigSchema extends InterfaceConfigSchema,
  TState extends object,
  TRecipientSchema extends MessageRecipientSchema,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> {
  /**
   * Whether delivery can actually be attempted right now.
   *
   * A declaration either writes `deliver` or does not, decided when it is
   * authored — but an interface whose outbound credentials are absent must
   * still register its channel and run inbound-only, rather than advertising
   * a delivery that fails on use. Omitted, delivery is available whenever
   * `deliver` is declared. Named consumer: @brains/email.
   */
  readonly available?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
      }) => boolean | Promise<boolean>)
    | undefined;
  /** Requests this interface answers on the message bus. */
  readonly subscriptions?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
      }) => readonly AnySubscriptionDefinition[])
    | undefined;
  readonly daemons?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
      }) => readonly (
        | InterfaceDaemonDefinition
        | (TAccountSettings extends AnyAccountSettingsDefinition
            ? AccountInterfaceDaemonDefinition<TAccountSettings>
            : never)
      )[])
    | undefined;
  /**
   * HTTP this interface answers itself.
   *
   * A channel is not always only a channel: web-chat is a chat interface and
   * the console people reach it through, serving a page, uploads and a
   * session list. The generic family has had this all along; there was never
   * a reason a message interface could not.
   * Named consumer: @brains/web-chat.
   */
  readonly routes?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        readonly jobs: InterfaceJobs;
        /**
         * Handing a turn to the pipeline from a request.
         *
         * The same receiver `listen` gets. An interface whose inbound path is
         * HTTP rather than a socket still wants everything the pipeline does
         * — tracking what is pending, routing a reply that resolves it,
         * deciding what the answer is made of — and the only difference is
         * what carried the message in. Named consumer: @brains/web-chat.
         */
        readonly messages: MessageReceiver;
      }) => readonly AnyInterfaceRouteDefinition[])
    | undefined;
  readonly listen?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        readonly signal: AbortSignal;
        readonly health: InterfaceDaemonHealth;
        readonly messages: MessageReceiver;
      }) => Promise<void>)
    | undefined;
  readonly send?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        readonly channel: MessageChannel;
        readonly message: MessageOutput;
        /**
         * Whether this is an answer to something someone said, or the
         * runtime reporting on work it is doing.
         *
         * The two arrive through different paths already; naming the
         * difference lets an interface treat them differently — a terminal
         * coalesces job progress into a status line and prints replies as
         * conversation, and telling them apart by inspecting the rendered
         * text is guesswork. Named consumer: @brains/chat-repl.
         */
        readonly origin: "reply" | "progress";
        /**
         * The event a progress-origin message was rendered from.
         *
         * `progress` takes the runtime out of it entirely, which suits a
         * stream. A channel that draws a progress card still wants the
         * runtime to remember which message to edit, throttle the edits and
         * hold completions until the answer has landed; given the event it
         * draws the card and leaves the bookkeeping where it is. Absent
         * behind a reply. Named consumer: @brains/chat.
         */
        readonly event?: JobProgressEvent | undefined;
      }) => string | void | Promise<string | void>)
    | undefined;
  /**
   * How work in flight reads on this channel, when prose will not do.
   *
   * The pipeline renders a progress event as text and sends it, which is
   * right for a terminal — a status line is a line. A client on the other end
   * of an event stream needs the event: web-chat writes a frame carrying the
   * job's id, status and percentage and draws a bar from it, and given only
   * a sentence it would have to parse one back apart.
   *
   * Declaring this takes the rendered text out of `send`, so an interface
   * that draws progress itself does not also print it. Omitting it keeps the
   * old path. Named consumer: @brains/web-chat.
   */
  readonly progress?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        readonly channel: MessageChannel;
        readonly event: JobProgressEvent;
      }) => void | Promise<void>)
    | undefined;
  /**
   * What a tool doing something reads as, while it does it.
   *
   * The same argument as `progress`, for the other half: a client wants the
   * tool name and state so it can draw its own row and replace it when the
   * tool finishes.
   * Named consumer: @brains/web-chat.
   *
   * Unlike `progress` there is no fallback to replace: without this slot a
   * declared interface sees no tool activity at all.
   */
  readonly toolStatus?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        readonly channel: MessageChannel;
        readonly update: ToolStatusUpdate;
      }) => void | Promise<void>)
    | undefined;
  readonly edit?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        readonly channel: MessageChannel;
        readonly messageId: string;
        readonly message: MessageOutput;
        /** The progress event behind the edit; see `send`. */
        readonly event?: JobProgressEvent | undefined;
      }) => void | Promise<void>)
    | undefined;
  /**
   * How an answer reads on this channel.
   *
   * The runtime decides what an answer is made of and in what order — text,
   * artifacts, the approvals it is waiting on — because that selection must
   * not drift between interfaces. What it cannot decide is how any of it
   * looks, or how much of it arrives at once: a terminal joins the whole
   * answer into one block and spells an approval out as "reply yes 1", a
   * chat channel sends the text and then a card as separate messages.
   * Neither is a rendering of the other, and neither is a grouping of it.
   *
   * Return one message, several in order, or none. Omitting the slot sends
   * the response text and drops the rest, which is what every declared
   * interface did before there was a way to say otherwise.
   * Named consumers: @brains/chat-repl, @brains/chat, @brains/web-chat.
   *
   * Or post the answer itself and return the message it became. A channel
   * that answers with a card and the artifact's bytes attached has nothing
   * that survives being returned as text for `send`; what the runtime still
   * needs from it is the id, so the jobs the answer started edit that
   * message when they finish, the way they edit one the runtime sent.
   * Named consumer: @brains/chat.
   */
  readonly present?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        readonly channel: MessageChannel;
        readonly directives: readonly ResponseRenderDirective[];
        /**
         * Set when this answer resolves an approval, and which way it went.
         *
         * A confirmation outcome reads differently from an answer: chat
         * titles the card "Approved" or "Declined" and clears the buttons it
         * drew for the question. The directives alone do not say that the
         * question was asked and answered here. Named consumer: @brains/chat.
         */
        readonly confirmation?: PresentedConfirmation | undefined;
        /**
         * The level the answer is shown at — the caller's, as the runtime
         * resolved it when it denied the artifacts this caller may not see.
         * A channel that attaches an artifact's bytes decides by the same
         * level whether to. Named consumer: @brains/chat.
         */
        readonly permissionLevel: UserPermissionLevel;
      }) =>
        | string
        | readonly string[]
        | PresentedMessage
        | undefined
        | Promise<string | readonly string[] | PresentedMessage | undefined>)
    | undefined;
  /**
   * The inbound half of `present`: what a reply means on this channel.
   *
   * A terminal that numbered the approvals it printed accepts "yes 2", and
   * only that interface knows what 2 refers to — a client with buttons has
   * no ordinals to resolve. Return the message with the approval named, or
   * the message unchanged; the runtime routes what comes back.
   * Named consumer: @brains/chat-repl.
   */
  readonly interpret?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        readonly text: string;
        /** In the order this interface last presented them. */
        readonly approvalIds: readonly string[];
      }) => string)
    | undefined;
  readonly deliver?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        readonly recipient: z.output<TRecipientSchema>;
        readonly message: MessageOutput;
        /** The addressed envelope, for transports that carry more than a body. */
        readonly delivery: MessageDelivery;
      }) =>
        | string
        | void
        | MessageDeliveryOutcome
        | Promise<string | void | MessageDeliveryOutcome>)
    | undefined;
}

/** The header and the behavior, as the runtime reads them. */
export type MessageInterfaceDefinitionInput<
  TConfigSchema extends InterfaceConfigSchema,
  TState extends object,
  TRecipientSchema extends MessageRecipientSchema,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> = MessageInterfaceDefinitionHeader<
  TConfigSchema,
  TState,
  TRecipientSchema,
  TAccountSettings
> &
  MessageInterfaceDefinitionBehavior<
    TConfigSchema,
    TState,
    TRecipientSchema,
    TAccountSettings
  >;
