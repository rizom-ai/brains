import type { z } from "@brains/utils/zod";
import type { Logger } from "@brains/utils/logger";
import type {
  AccountSettingsValue,
  AnyAccountSettingsDefinition,
} from "../operator/account-settings-definition-contract";
import type {
  AnyServiceJobDefinition,
  AnyServiceToolDefinition,
} from "../service/service-definition-contract";
import type { IAuthRegistry } from "../contracts/auth-registry";
import type { IMCPTransport } from "../interfaces";
import type { AgentNamespace } from "../contracts/agent";
import type { ResponseRenderDirective } from "../message-interface/response-render-plan";
import type { IPermissionsNamespace } from "../public/types";
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
import type { AnyInterfaceRouteDefinition } from "./route-contract";

export { routeMethods } from "./route-contract";
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
  RouteMethod,
  RouteSecurity,
} from "./route-contract";

export type InterfaceConfigSchema = z.ZodType<object, object>;
export type MessageRecipientSchema = z.ZodType<unknown, unknown>;

export interface InterfaceJobReference {
  readonly id: string;
}

export interface InterfaceJobs {
  enqueue<TDefinition extends AnyServiceJobDefinition>(
    definition: TDefinition,
    input: z.input<TDefinition["input"]>,
  ): Promise<InterfaceJobReference>;
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

export interface InterfaceDefinitionInput<
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
    | ((context: {
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
         * The runtime's server for the protocol this interface hosts.
         *
         * The tools and resources every package registered are already on
         * it; what an interface adds is a transport to reach them over, and
         * the mode and permission level that transport confers.
         * Named consumer: @brains/mcp.
         */
        readonly mcpTransport: IMCPTransport;
        /**
         * What a caller arriving over this transport may do. A protocol
         * host resolves that once, from the transport rather than from a
         * person — stdio is whoever runs the process.
         */
        readonly permissions: IPermissionsNamespace;
        /**
         * The thing that answers.
         *
         * An interface is how someone reaches the brain, so the tools it
         * offers of its own are conversational: `chat` asks, `confirm`
         * answers a question the brain asked back. Both are the agent's,
         * and an interface holds the handle rather than being handed one
         * per call. Named consumer: @brains/mcp.
         */
        readonly agent: AgentNamespace;
        /** The brain's own domain, when it has one. */
        readonly domain: string | undefined;
        readonly logger: Logger;
      }) => TState)
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
}

// A subscription is not an interface concept — a service answers requests on
// the bus too — so it lives in contracts/ and both families name it there.
import type { AnySubscriptionDefinition } from "../contracts/subscription";

export type {
  AnySubscriptionDefinition,
  SubscriptionDefinition,
} from "../contracts/subscription";

/** The narrow publish surface an interface gets, not the whole bus. */
export interface MessageInterfacePublisher {
  send(message: {
    readonly type: string;
    readonly payload: unknown;
  }): Promise<unknown>;
}

export interface MessageOutput {
  readonly text: string;
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
}

export interface InboundMessageSender {
  readonly id: string;
  readonly displayName?: string | undefined;
}

export interface InboundMessageAttachment {
  readonly name: string;
  readonly mediaType: string;
  readonly url: string;
}

export interface ReceiveAuthenticatedInput {
  readonly sender: InboundMessageSender;
  readonly channel: MessageChannel;
  readonly text: string;
  readonly attachments?:
    (() => Promise<readonly InboundMessageAttachment[]>) | undefined;
}

export interface MessageReceiver {
  receiveAuthenticated(input: ReceiveAuthenticatedInput): Promise<void>;
}

export interface MessageInterfaceDefinitionInput<
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
   * **Write this before any slot that destructures `state`.** The state type
   * is inferred from what `setup` returns, and a destructured parameter above
   * it resolves its context while that type is still unknown — which silently
   * fixes `state` to an empty object rather than failing, so every later slot
   * reports its own fields as missing.
   */
  readonly setup?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        /**
         * Bookkeeping that has to survive a restart.
         *
         * An interface that reads a mailbox remembers how far it got, and
         * without that it re-reads everything on every boot. Scoped by
         * namespace under this interface's id and validated by a schema.
         * Named `runtimeState` rather than `state` because `state` already
         * means what setup returns.
         */
        readonly runtimeState: <TValue>(
          options: RuntimeStateScopeOptions<TValue>,
        ) => IRuntimeStateStore<TValue>;
        /**
         * Handing on something that arrived from outside.
         *
         * A chat turn goes back through `messages.receiveAuthenticated`, but
         * not everything an interface receives is a turn — an inbound email is
         * an event other packages consume. Named consumer: @brains/email.
         */
        readonly messaging: MessageInterfacePublisher;
        readonly logger: Logger;
      }) => TState | Promise<TState>)
    | undefined;
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
      }) => string | void | Promise<string | void>)
    | undefined;
  readonly edit?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        readonly channel: MessageChannel;
        readonly messageId: string;
        readonly message: MessageOutput;
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
   */
  readonly present?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        readonly channel: MessageChannel;
        readonly directives: readonly ResponseRenderDirective[];
      }) =>
        | string
        | readonly string[]
        | undefined
        | Promise<string | readonly string[] | undefined>)
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
