import type { UserPermissionLevel } from "@brains/templates";
import type { z } from "@brains/utils/zod";
import type { Logger } from "@brains/utils/logger";
import type {
  AccountSettingsValue,
  AnyAccountSettingsDefinition,
} from "../operator/account-settings-definition-contract";
import type { AnyServiceJobDefinition } from "../service/service-definition-contract";
import type {
  ChannelDeliverySensitivity,
  ChannelDeliveryThreading,
  ChannelSubjectPattern,
} from "../channel-registry";
import type {
  IRuntimeStateStore,
  RuntimeStateScopeOptions,
} from "@brains/runtime-state";

export const routeMethods = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "OPTIONS",
] as const;
export type RouteMethod = (typeof routeMethods)[number];
export type InterfaceSchema = z.ZodType<unknown, unknown>;
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

export interface InterfaceActor {
  readonly id: string;
  readonly displayName?: string | undefined;
}

export interface InterfaceCaller {
  readonly actor: InterfaceActor;
  readonly permission: UserPermissionLevel;
  readonly isAnchor: boolean;
}

export interface ProtocolSecurityDefinition {
  readonly kind: "protocol";
  authenticate(context: {
    readonly request: Request;
  }): InterfaceActor | null | Promise<InterfaceActor | null>;
}

export interface PublicSecurityDefinition {
  readonly kind: "public";
}

export type RouteSecurity =
  PublicSecurityDefinition | ProtocolSecurityDefinition;
export type RouteCaller<TSecurity extends RouteSecurity> =
  TSecurity extends ProtocolSecurityDefinition ? InterfaceCaller : null;
export type RouteBody<TSchema extends InterfaceSchema | undefined> =
  TSchema extends InterfaceSchema ? z.output<TSchema> : undefined;

export interface InterfaceRouteInput<
  TMethod extends RouteMethod = RouteMethod,
  TBodySchema extends InterfaceSchema | undefined = InterfaceSchema | undefined,
  TResponseSchema extends InterfaceSchema = InterfaceSchema,
  TSecurity extends RouteSecurity = RouteSecurity,
> {
  readonly method: TMethod;
  readonly path: string;
  readonly security: TSecurity;
  readonly body?: TBodySchema | undefined;
  readonly response: TResponseSchema;
  handle(context: {
    readonly request: Request;
    readonly body: RouteBody<TBodySchema>;
    readonly caller: RouteCaller<TSecurity>;
  }): unknown | Promise<unknown>;
}

export interface InterfaceRouteDefinition<
  TMethod extends RouteMethod = RouteMethod,
  TBodySchema extends InterfaceSchema | undefined = InterfaceSchema | undefined,
  TResponseSchema extends InterfaceSchema = InterfaceSchema,
  TSecurity extends RouteSecurity = RouteSecurity,
> extends InterfaceRouteInput<
  TMethod,
  TBodySchema,
  TResponseSchema,
  TSecurity
> {
  readonly kind: "rizom-interface-route";
}

export type AnyInterfaceRouteDefinition = InterfaceRouteDefinition<
  RouteMethod,
  InterfaceSchema | undefined,
  InterfaceSchema,
  RouteSecurity
>;

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
> {
  readonly id: string;
  readonly config: TConfigSchema;
  readonly accountSettings?: TAccountSettings | undefined;
  readonly routes?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly jobs: InterfaceJobs;
      }) => readonly AnyInterfaceRouteDefinition[])
    | undefined;
  readonly daemons?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
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
