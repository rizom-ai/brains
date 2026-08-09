import type { UserPermissionLevel } from "@brains/templates";
import type { z } from "@brains/utils/zod";
import { createDeclarativeInterfacePlugin } from "../interface/declarative-interface-plugin";
import { createDeclarativeMessageInterfacePlugin } from "../message-interface/declarative-message-interface-plugin";
import {
  assertIdentifier,
  createPluginPackageDefinition,
} from "../package-definition";
import type { AnyServiceJobDefinition } from "./service-definition";

const routeMethods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"] as const;
type RouteMethod = (typeof routeMethods)[number];
type InterfaceSchema = z.ZodType<unknown, unknown>;
type InterfaceConfigSchema = z.ZodType<object, object>;
type MessageRecipientSchema = z.ZodType<unknown, unknown>;

interface InterfaceJobReference {
  readonly id: string;
}

interface InterfaceJobs {
  enqueue<TDefinition extends AnyServiceJobDefinition>(
    definition: TDefinition,
    input: z.input<TDefinition["input"]>,
  ): Promise<InterfaceJobReference>;
}

interface InterfaceActor {
  readonly id: string;
  readonly displayName?: string | undefined;
}

interface InterfaceCaller {
  readonly actor: InterfaceActor;
  readonly permission: UserPermissionLevel;
  readonly isAnchor: boolean;
}

interface ProtocolSecurityDefinition {
  readonly kind: "protocol";
  authenticate(context: {
    readonly request: Request;
  }): InterfaceActor | null | Promise<InterfaceActor | null>;
}

interface PublicSecurityDefinition {
  readonly kind: "public";
}

type RouteSecurity = PublicSecurityDefinition | ProtocolSecurityDefinition;
type RouteCaller<TSecurity extends RouteSecurity> =
  TSecurity extends ProtocolSecurityDefinition ? InterfaceCaller : null;
type RouteBody<TSchema extends InterfaceSchema | undefined> =
  TSchema extends InterfaceSchema ? z.output<TSchema> : undefined;

interface InterfaceRouteInput<
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

interface InterfaceRouteDefinition<
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

type AnyInterfaceRouteDefinition = InterfaceRouteDefinition<
  RouteMethod,
  InterfaceSchema | undefined,
  InterfaceSchema,
  RouteSecurity
>;

interface InterfaceDaemonHealth {
  ready(): void;
  warning(message: string): void;
}

interface InterfaceDaemonDefinition {
  readonly kind: "rizom-interface-daemon";
  readonly id: string;
  readonly required: boolean;
  run(context: {
    readonly signal: AbortSignal;
    readonly health: InterfaceDaemonHealth;
  }): Promise<void>;
}

interface InterfaceDefinitionInput<
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

interface MessageChannelDefinition<
  TRecipientSchema extends MessageRecipientSchema,
> {
  readonly type: string;
  readonly displayName: string;
  readonly subjectLabel: string;
  readonly recipient: TRecipientSchema;
}

interface MessageOutput {
  readonly text: string;
}

interface MessageChannel {
  readonly id: string;
  readonly threadId?: string | undefined;
}

interface InboundMessageSender {
  readonly id: string;
  readonly displayName?: string | undefined;
}

interface InboundMessageAttachment {
  readonly name: string;
  readonly mediaType: string;
  readonly url: string;
}

interface ReceiveAuthenticatedInput {
  readonly sender: InboundMessageSender;
  readonly channel: MessageChannel;
  readonly text: string;
  readonly attachments?:
    (() => Promise<readonly InboundMessageAttachment[]>) | undefined;
}

interface MessageReceiver {
  receiveAuthenticated(input: ReceiveAuthenticatedInput): Promise<void>;
}

interface MessageInterfaceDefinitionInput<
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

export function protocol(
  definition: Omit<ProtocolSecurityDefinition, "kind">,
): ProtocolSecurityDefinition {
  return Object.freeze({ kind: "protocol", ...definition });
}

export function defineRoute<
  const TMethod extends RouteMethod,
  TBodySchema extends InterfaceSchema | undefined,
  TResponseSchema extends InterfaceSchema,
  const TSecurity extends RouteSecurity,
>(
  definition: InterfaceRouteInput<
    TMethod,
    TBodySchema,
    TResponseSchema,
    TSecurity
  >,
): InterfaceRouteDefinition<TMethod, TBodySchema, TResponseSchema, TSecurity> {
  if (!routeMethods.includes(definition.method)) {
    throw new Error(
      `Unsupported interface route method "${definition.method}"`,
    );
  }
  if (!definition.path.startsWith("/")) {
    throw new Error(
      `Interface route path "${definition.path}" must be absolute`,
    );
  }
  return Object.freeze({ kind: "rizom-interface-route", ...definition });
}

export function defineDaemon(
  definition: Omit<InterfaceDaemonDefinition, "kind" | "required"> & {
    readonly required?: boolean | undefined;
  },
): InterfaceDaemonDefinition {
  assertIdentifier(definition.id, "Daemon id");
  const { required = false, ...daemon } = definition;
  return Object.freeze({
    kind: "rizom-interface-daemon",
    ...daemon,
    required,
  });
}

export function defineInterface<TConfigSchema extends InterfaceConfigSchema>(
  definition: InterfaceDefinitionInput<TConfigSchema>,
): {
  readonly kind: "rizom-plugin-package";
  readonly family: "interface";
  readonly id: string;
  readonly config: TConfigSchema;
} {
  return createPluginPackageDefinition({
    family: "interface",
    id: definition.id,
    config: definition.config,
    instantiate: ({ config, package: metadata, scope }) =>
      createDeclarativeInterfacePlugin(
        definition,
        config,
        metadata,
        scope(definition.id),
      ),
  });
}

export function defineMessageInterface<
  TConfigSchema extends InterfaceConfigSchema,
  TState extends object = Record<never, never>,
  TRecipientSchema extends MessageRecipientSchema = MessageRecipientSchema,
>(
  definition: MessageInterfaceDefinitionInput<
    TConfigSchema,
    TState,
    TRecipientSchema
  >,
): {
  readonly kind: "rizom-plugin-package";
  readonly family: "message-interface";
  readonly id: string;
  readonly config: TConfigSchema;
} {
  assertIdentifier(definition.channel.type, "Channel type");
  if (definition.listen && !definition.send) {
    throw new Error(
      `Message interface "${definition.id}" must define send when it defines listen`,
    );
  }
  if (definition.edit && !definition.send) {
    throw new Error(
      `Message interface "${definition.id}" must define send when it defines edit`,
    );
  }
  return createPluginPackageDefinition({
    family: "message-interface",
    id: definition.id,
    config: definition.config,
    instantiate: ({ config, package: metadata, scope }) =>
      createDeclarativeMessageInterfacePlugin(
        definition,
        config,
        metadata,
        scope(definition.id),
      ),
  });
}

export type {
  AnyInterfaceRouteDefinition,
  InboundMessageAttachment,
  InterfaceCaller,
  InterfaceDaemonDefinition,
  InterfaceDefinitionInput,
  InterfaceJobs,
  MessageInterfaceDefinitionInput,
  MessageOutput,
  MessageReceiver,
  ProtocolSecurityDefinition,
  ReceiveAuthenticatedInput,
  RouteSecurity,
};
