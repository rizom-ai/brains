import { createDeclarativeInterfacePlugin } from "../interface/declarative-interface-plugin";
import type {
  InterfaceConfigSchema,
  InterfaceDaemonDefinition,
  InterfaceDefinitionInput,
  InterfaceRouteDefinition,
  InterfaceRouteInput,
  InterfaceSchema,
  MessageInterfaceDefinitionInput,
  MessageRecipientSchema,
  ProtocolSecurityDefinition,
  RouteMethod,
  RouteSecurity,
} from "../interface/interface-definition-contract";
import { createDeclarativeMessageInterfacePlugin } from "../message-interface/declarative-message-interface-plugin";
import {
  assertIdentifier,
  createPluginPackageDefinition,
} from "../package-definition";

export type {
  AnyInterfaceRouteDefinition,
  InboundMessageAttachment,
  InterfaceActor,
  InterfaceCaller,
  InterfaceConfigSchema,
  InterfaceDaemonDefinition,
  InterfaceDaemonHealth,
  InterfaceDefinitionInput,
  InterfaceJobReference,
  InterfaceJobs,
  InterfaceRouteDefinition,
  InterfaceRouteInput,
  InterfaceSchema,
  MessageChannel,
  MessageChannelDefinition,
  MessageInterfaceDefinitionInput,
  MessageOutput,
  MessageReceiver,
  MessageRecipientSchema,
  ProtocolSecurityDefinition,
  PublicSecurityDefinition,
  ReceiveAuthenticatedInput,
  RouteBody,
  RouteCaller,
  RouteMethod,
  RouteSecurity,
} from "../interface/interface-definition-contract";

const routeMethods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"] as const;

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
