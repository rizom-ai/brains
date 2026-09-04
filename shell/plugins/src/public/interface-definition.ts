import { createDeclarativeInterfacePlugin } from "../interface/declarative-interface-plugin";
import type { AnyAccountSettingsDefinition } from "../operator/account-settings-definition-contract";
import {
  routeMethods,
  verbatim,
} from "../interface/interface-definition-contract";
import { freeze } from "@brains/utils/freeze";
import type {
  AccountInterfaceDaemonDefinition,
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
  RouteResponse,
  RouteSecurity,
} from "../interface/interface-definition-contract";
import { createDeclarativeMessageInterfacePlugin } from "../message-interface/declarative-message-interface-plugin";
import type {
  SubscriptionDefinition,
  SubscriptionPayloadSchema,
} from "../contracts/subscription";
import {
  assertIdentifier,
  createPluginPackageDefinition,
} from "../package-definition";

export { defineAccountSettings } from "../operator/account-settings-definition-contract";
export type {
  AccountSettingsDefinition,
  AccountSettingsFieldDefinition,
  AccountSettingsValue,
} from "../operator/account-settings-definition-contract";

export type {
  AccountInterfaceDaemonDefinition,
  AnyInterfaceDaemonDefinition,
  AnyInterfaceRouteDefinition,
  InboundMessageAttachment,
  InterfaceActor,
  InterfaceCaller,
  InterfaceConfigSchema,
  InterfaceDaemonDefinition,
  InterfaceDaemonHealth,
  InterfaceDefinitionInput,
  InterfaceJobReference,
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
  InterfaceEntityReader,
  InterfaceJobs,
  InterfaceJobStatus,
  InterfaceSetupContext,
  InterfaceUploads,
  RouteResponse,
  RouteSecurity,
  VerbatimResponse,
} from "../interface/interface-definition-contract";
// The store `uploads` hands back, and what it takes and returns. A declaration
// holds one, so its shape is part of the authoring surface.
export type {
  ResolvedRuntimeUpload,
  RuntimeUploadRecord,
  RuntimeUploadScopeOptions,
  SaveRuntimeUploadInput,
  ScopedRuntimeUploadStore,
} from "../service/upload-registry";
export { verbatim };

export function protocol(
  definition: Omit<ProtocolSecurityDefinition, "kind">,
): ProtocolSecurityDefinition {
  return Object.freeze({ kind: "protocol", ...definition });
}

/**
 * A request a package answers on the bus, with its payload schema.
 *
 * Written as a helper rather than a bare object so `handle` sees the parsed
 * payload typed, the same way `defineRoute` types a body. Interfaces and
 * services both declare these.
 */
export function defineSubscription<
  TPayloadSchema extends SubscriptionPayloadSchema,
>(
  definition: SubscriptionDefinition<TPayloadSchema>,
): SubscriptionDefinition<TPayloadSchema> {
  assertIdentifier(definition.topic.split(":")[0] ?? "", "Subscription topic");
  return definition;
}

export function defineRoute<
  const TMethod extends RouteMethod,
  TBodySchema extends InterfaceSchema | undefined,
  TResponseSchema extends RouteResponse,
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
): InterfaceDaemonDefinition;
export function defineDaemon<
  TAccountSettings extends AnyAccountSettingsDefinition,
>(
  definition: Omit<
    AccountInterfaceDaemonDefinition<TAccountSettings>,
    "kind" | "required"
  > & {
    readonly required?: boolean | undefined;
  },
): AccountInterfaceDaemonDefinition<TAccountSettings>;
export function defineDaemon(
  definition: Omit<
    InterfaceDaemonDefinition | AccountInterfaceDaemonDefinition,
    "kind" | "required"
  > & {
    readonly required?: boolean | undefined;
  },
): InterfaceDaemonDefinition | AccountInterfaceDaemonDefinition {
  assertIdentifier(definition.id, "Daemon id");
  const { required = false, ...daemon } = definition;
  const result: InterfaceDaemonDefinition | AccountInterfaceDaemonDefinition = {
    kind: "rizom-interface-daemon",
    ...daemon,
    required,
  };
  return freeze(result);
}

export function defineInterface<
  TConfigSchema extends InterfaceConfigSchema,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined = undefined,
  TState extends object = Record<never, never>,
>(
  definition: InterfaceDefinitionInput<TConfigSchema, TAccountSettings, TState>,
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
  TAccountSettings extends AnyAccountSettingsDefinition | undefined = undefined,
>(
  definition: MessageInterfaceDefinitionInput<
    TConfigSchema,
    TState,
    TRecipientSchema,
    TAccountSettings
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
