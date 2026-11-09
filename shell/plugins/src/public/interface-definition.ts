import { createDeclarativeInterfacePlugin } from "../interface/declarative-interface-plugin";
import type { AnyAccountSettingsDefinition } from "../operator/account-settings-definition-contract";
import { routeMethods } from "../interface/interface-definition-contract";
import { freeze } from "@brains/utils/freeze";
import {
  isReturnToRoute,
  type AnyDeclaredRouteDefinition,
  type ReturnToRouteDefinition,
  type ReturnToRouteInput,
  type ReturnToWorkspace,
} from "../interface/route-definition-contract";
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
import type { z } from "@brains/utils/zod";
import {
  assertIdentifier,
  createPluginPackageDefinition,
  instantiateWithinPackage,
  type PluginPackageDefinition,
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

/**
 * A browser navigation that ends in one of the package's own Studio
 * workspaces: the handler answers with the workspace's query input, and the
 * runtime answers 303 to the workspace's URL with that query.
 */
export function defineRoute<
  const TSecurity extends RouteSecurity,
  const TWorkspace extends ReturnToWorkspace,
>(
  definition: ReturnToRouteInput<TSecurity, TWorkspace>,
): ReturnToRouteDefinition<TSecurity, TWorkspace>;
/** A route that answers with its response schema's input, as JSON. */
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
): InterfaceRouteDefinition<TMethod, TBodySchema, TResponseSchema, TSecurity>;
export function defineRoute(
  definition: InterfaceRouteInput | ReturnToRouteInput,
): AnyDeclaredRouteDefinition {
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
  if (isReturnToRoute(definition)) {
    const { returnTo } = definition;
    // Read as declared: the types say what kind it is, a caller past them may not.
    const kind: string = returnTo.kind;
    // Read as declared: the types say GET, but a caller past them may not.
    const method: string = definition.method;
    if (method !== "GET") {
      throw new Error(
        `Route ${method} ${definition.path} returns the browser, which only a GET navigation does`,
      );
    }
    if (kind !== "rizom-studio-workspace" || !returnTo.query) {
      throw new Error(
        `Route ${definition.path} returns to a Studio workspace that declares no query to come back with`,
      );
    }
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
    instantiate: ({ config, package: metadata, scope, pluginId }) =>
      createDeclarativeInterfacePlugin(
        definition,
        config,
        metadata,
        pluginId ?? scope(definition.id),
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
    instantiate: ({ config, package: metadata, scope, pluginId }) =>
      createDeclarativeMessageInterfacePlugin(
        definition,
        config,
        metadata,
        pluginId ?? scope(definition.id),
      ),
  });
}

/**
 * The types admit only message interfaces into a package; this tells an
 * untyped author too.
 */
function isMessageInterface(definition: PluginPackageDefinition): boolean {
  return definition.family === "message-interface";
}

/** The packages `defineMessageInterfacePackage` returned, so one is not nested in another. */
const messageInterfacePackages = new WeakSet<PluginPackageDefinition>();

/**
 * One package, several message interfaces, chosen from one config.
 *
 * Each interface is a `defineMessageInterface` declared over the package's
 * own config schema, and which of them run is a fact about that config, so
 * the list is a function of it: an interface without credentials is not
 * declared. Every interface is its own plugin under the package, with its own
 * channel, and keeps its state under the package that owns them all.
 */
export function defineMessageInterfacePackage<
  TConfigSchema extends InterfaceConfigSchema,
>(definition: {
  readonly id: string;
  readonly config: TConfigSchema;
  // The schema is inferred from the package's own config alone, so an
  // interface declared over another schema is the one refused.
  readonly interfaces: (context: {
    readonly config: z.output<TConfigSchema>;
  }) => readonly {
    readonly kind: "rizom-plugin-package";
    readonly family: "message-interface";
    readonly id: string;
    readonly config: NoInfer<TConfigSchema>;
  }[];
}): {
  readonly kind: "rizom-plugin-package";
  readonly family: "message-interface";
  readonly id: string;
  readonly config: TConfigSchema;
} {
  const label = `Message interface package "${definition.id}"`;
  const declared = createPluginPackageDefinition({
    family: "message-interface",
    id: definition.id,
    config: definition.config,
    instantiate: (context) => {
      // Each interface is its own plugin, so no one id names them all.
      if (context.pluginId !== undefined) {
        throw new Error(
          `${label} keeps no legacy plugin id; each of its interfaces is its own plugin`,
        );
      }
      const interfaces = definition.interfaces({ config: context.config });
      const ids = new Set<string>();
      for (const declaration of interfaces) {
        if (messageInterfacePackages.has(declaration)) {
          throw new Error(
            `${label} declares package "${declaration.id}"; list its interfaces instead`,
          );
        }
        if (!isMessageInterface(declaration)) {
          throw new Error(
            `${label} declares "${declaration.id}", which is not a message interface`,
          );
        }
        // The package's config is parsed once, by its own schema; an
        // interface declared over another would read a config it never saw.
        if (declaration.config !== definition.config) {
          throw new Error(
            `${label} declares "${declaration.id}" over a config schema other than its own`,
          );
        }
        if (ids.has(declaration.id)) {
          throw new Error(`${label} declares "${declaration.id}" twice`);
        }
        ids.add(declaration.id);
      }
      return interfaces.flatMap((declaration) =>
        instantiateWithinPackage(declaration, context),
      );
    },
  });
  messageInterfacePackages.add(declared);
  return declared;
}
