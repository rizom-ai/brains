import type { UserPermissionLevel } from "@brains/templates";
import type { z } from "@brains/utils/zod";
import type { AnyServiceJobDefinition } from "../service/service-definition-contract";

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
  run(context: {
    readonly signal: AbortSignal;
    readonly health: InterfaceDaemonHealth;
  }): Promise<void>;
}

export interface InterfaceDefinitionInput<
  TConfigSchema extends InterfaceConfigSchema,
> {
  readonly id: string;
  readonly config: TConfigSchema;
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
      }) => readonly InterfaceDaemonDefinition[])
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
> {
  readonly id: string;
  readonly config: TConfigSchema;
  readonly channel: MessageChannelDefinition<TRecipientSchema>;
  readonly setup?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
      }) => TState | Promise<TState>)
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
