import { createDeclarativeInterfacePlugin } from "../interface/declarative-interface-plugin";
import type { AnyAccountSettingsDefinition } from "../operator/account-settings-definition-contract";
import { routeMethods } from "../interface/interface-definition-contract";
import { freeze } from "@brains/utils/freeze";
import type {
  AccountInterfaceDaemonDefinition,
  InterfaceConfigSchema,
  InterfaceDaemonDefinition,
  InterfaceDefinitionBehavior,
  InterfaceDefinitionHeader,
  InterfaceRouteDefinition,
  InterfaceRouteInput,
  InterfaceSchema,
  MessageInterfaceDefinitionBehavior,
  MessageInterfaceDefinitionHeader,
  MessageRecipientSchema,
  ProtocolSecurityDefinition,
  RouteMethod,
  RouteSecurity,
} from "../interface/interface-definition-contract";
import { createDeclarativeMessageInterfacePlugin } from "../message-interface/declarative-message-interface-plugin";
import {
  assertTwoStageSlots,
  type TwoStageSlots,
} from "../internal/two-stage-declaration";
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
  InterfaceDaemons,
  InterfaceDefinitionBehavior,
  InterfaceDefinitionHeader,
  InterfaceDefinitionInput,
  InterfaceJobReference,
  InterfaceJobs,
  InterfaceRouteDefinition,
  InterfaceRouteInput,
  InterfaceSchema,
  InterfaceSetupContext,
  MessageChannel,
  MessageChannelDefinition,
  MessageInterfaceDefinitionBehavior,
  MessageInterfaceDefinitionHeader,
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

/** What an interface header and its behavior may declare. */
const interfaceSlots: TwoStageSlots = {
  label: "Interface",
  helper: "defineInterface",
  header: new Set(["id", "config", "accountSettings", "setup"]),
  behavior: new Set(["routes", "daemons"]),
};

/** What a message interface header and its behavior may declare. */
const messageInterfaceSlots: TwoStageSlots = {
  label: "Message interface",
  helper: "defineMessageInterface",
  header: new Set(["id", "config", "accountSettings", "channel", "setup"]),
  behavior: new Set(["daemons", "listen", "send", "edit", "deliver"]),
};

export function protocol(
  definition: Omit<ProtocolSecurityDefinition, "kind">,
): ProtocolSecurityDefinition {
  return Object.freeze({ kind: "protocol", ...definition });
}

export function defineRoute<
  const TMethod extends RouteMethod,
  TBodySchema extends InterfaceSchema | undefined,
  const TResponseSchema extends InterfaceSchema,
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

/**
 * An interface package, declared in two halves: the header says what the
 * interface is and what it sets up; the behavior says what it serves with
 * that. Behavior is checked against the state the header already fixed, so
 * its slots may be written in any order.
 */
export function defineInterface<
  TConfigSchema extends InterfaceConfigSchema,
  TState extends object = Record<never, never>,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined = undefined,
>(
  header: InterfaceDefinitionHeader<TConfigSchema, TState, TAccountSettings>,
  behavior?: InterfaceDefinitionBehavior<
    TConfigSchema,
    TState,
    TAccountSettings
  >,
): {
  readonly kind: "rizom-plugin-package";
  readonly family: "interface";
  readonly id: string;
  readonly config: TConfigSchema;
} {
  assertTwoStageSlots(interfaceSlots, header, behavior);
  // The split exists so the state type is known before behavior is checked;
  // the runtime reads one declaration.
  const definition = { ...behavior, ...header };
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

/**
 * A message interface package, declared in two halves: the header says what
 * the interface is — its channel — and what it sets up; the behavior says how
 * it talks, reading the state the header already fixed.
 */
export function defineMessageInterface<
  TConfigSchema extends InterfaceConfigSchema,
  TState extends object = Record<never, never>,
  TRecipientSchema extends MessageRecipientSchema = MessageRecipientSchema,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined = undefined,
>(
  header: MessageInterfaceDefinitionHeader<
    TConfigSchema,
    TState,
    TRecipientSchema,
    TAccountSettings
  >,
  behavior?: MessageInterfaceDefinitionBehavior<
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
  assertTwoStageSlots(messageInterfaceSlots, header, behavior);
  const definition = { ...behavior, ...header };
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
