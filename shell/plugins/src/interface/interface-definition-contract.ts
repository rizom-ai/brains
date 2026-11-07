import type { z } from "@brains/utils/zod";
import type {
  AccountSettingsValue,
  AnyAccountSettingsDefinition,
} from "../operator/account-settings-definition-contract";
import type { AnyServiceJobDefinition } from "../service/service-definition-contract";

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
   * Prepares the state the interface's other functions receive. It also runs
   * in the queue worker, so `deliver` can send from background jobs there:
   * build clients, but leave connecting and listening to `listen` and
   * `daemons`.
   */
  readonly setup?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
      }) => TState | Promise<TState>)
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
      }) => string | void | Promise<string | void>)
    | undefined;
}
