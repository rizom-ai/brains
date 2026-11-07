import type { z } from "@brains/utils/zod";
import type {
  AccountSettingsValue,
  AnyAccountSettingsDefinition,
} from "../operator/account-settings-definition-contract";
import type {
  AnyServiceJobDefinition,
  ServiceSetupContext,
} from "../service/service-definition-contract";

import {
  routeMethods,
  type AnyInterfaceRouteDefinition,
} from "./route-definition-contract";
export { routeMethods };
export type InterfaceConfigSchema = z.ZodType<object, object>;
export type MessageRecipientSchema = z.ZodType<unknown, unknown>;
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
} from "./route-definition-contract";
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
 * What an interface's `setup` is given once, when it registers: the parsed
 * config, cleanup at shutdown, and runtime state kept under the owning
 * package, exactly as a service's setup is given them.
 */
export type InterfaceSetupContext<TConfig> = ServiceSetupContext<TConfig>;

/** The daemons an interface's `daemons` slot may return. */
export type InterfaceDaemons<
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> = readonly (
  | InterfaceDaemonDefinition
  | (TAccountSettings extends AnyAccountSettingsDefinition
      ? AccountInterfaceDaemonDefinition<TAccountSettings>
      : never)
)[];

/**
 * What an interface is and what it sets up, once, before anything runs. The
 * first of `defineInterface`'s two arguments, so the state `setup` returns is
 * known before any behavior slot is checked, in whatever order those are
 * written.
 */
export interface InterfaceDefinitionHeader<
  TConfigSchema extends InterfaceConfigSchema,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> {
  readonly id: string;
  readonly config: TConfigSchema;
  readonly accountSettings?: TAccountSettings | undefined;
  /** Builds the `state` every behavior slot reads, once, at registration. */
  readonly setup?:
    | ((
        context: InterfaceSetupContext<z.output<TConfigSchema>>,
      ) => TState | Promise<TState>)
    | undefined;
}

/**
 * What the interface does with what it set up: the second argument. Each slot
 * is given the interface's capabilities once, and the handlers it returns are
 * given only their own call's data.
 */
export interface InterfaceDefinitionBehavior<
  TConfigSchema extends InterfaceConfigSchema,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> {
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
      }) => InterfaceDaemons<TAccountSettings>)
    | undefined;
}

/** The header and the behavior, as the runtime reads them. */
export type InterfaceDefinitionInput<
  TConfigSchema extends InterfaceConfigSchema,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> = InterfaceDefinitionHeader<TConfigSchema, TState, TAccountSettings> &
  InterfaceDefinitionBehavior<TConfigSchema, TState, TAccountSettings>;

export interface MessageChannelDefinition<
  TRecipientSchema extends MessageRecipientSchema,
> {
  readonly type: string;
  readonly displayName: string;
  readonly subjectLabel: string;
  readonly recipient: TRecipientSchema;
}

export interface MessageOutput {
  readonly text: string;
}

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

/**
 * What a message interface is — its channel — and what it sets up: the first
 * of `defineMessageInterface`'s two arguments, so the state `setup` returns
 * and the channel's recipient are known before any behavior slot is checked.
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
   * Builds the `state` every behavior slot reads, once, at registration. It
   * also runs in the queue worker, so `deliver` can send from background jobs
   * there: build clients, but leave connecting and listening to `listen` and
   * `daemons`.
   */
  readonly setup?:
    | ((
        context: InterfaceSetupContext<z.output<TConfigSchema>>,
      ) => TState | Promise<TState>)
    | undefined;
}

/**
 * How the message interface talks: the second argument. `daemons` returns
 * handlers as a generic interface's does; `listen`, `send`, `edit` and
 * `deliver` are each called once per call, and given the interface's
 * capabilities beside that call's data.
 */
export interface MessageInterfaceDefinitionBehavior<
  TConfigSchema extends InterfaceConfigSchema,
  TState extends object,
  TRecipientSchema extends MessageRecipientSchema,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> {
  readonly daemons?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
      }) => InterfaceDaemons<TAccountSettings>)
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
      }) => string | void | Promise<string | void>)
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
