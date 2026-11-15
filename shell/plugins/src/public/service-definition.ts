import type { z } from "@brains/utils/zod";
import {
  assertIdentifier,
  createPluginPackageDefinition,
  type PluginPackageDefinition,
} from "../package-definition";
import { createDeclarativeServicePlugin } from "../service/declarative-service-plugin";
import {
  noFirstPartyServiceDeclarations,
  registerServiceRebuilder,
  type FirstPartyServiceDeclarations,
} from "../service/first-party-service";
import {
  assertTwoStageSlots,
  type TwoStageSlots,
} from "../internal/two-stage-declaration";
import { createEntityPackagePlugins } from "../entity/declarative-entity-plugin";
import type { AnyDataSourceDeclaration } from "../entity/entity-definition-contract";
import { assertDataSources } from "./entity-definition";
import type { AnyEntityDefinition } from "../entity/entity-definition-contract";
import type { AnyAccountSettingsDefinition } from "../operator/account-settings-definition-contract";
import type {
  NormalizedServiceDefinitionInput,
  ServiceDefinitionBehavior,
  ServiceDefinitionHeaderInput,
  ServiceSchemaMap,
  ServiceTemplateShapeMap,
} from "../service/service-definition-contract";

export { defineAccountSettings } from "../operator/account-settings-definition-contract";
export type {
  AccountSettingsDefinition,
  AccountSettingsFieldDefinition,
  AccountSettingsSecret,
  AccountSettingsValue,
} from "../operator/account-settings-definition-contract";
export {
  defineStudioWorkspace,
  defineDashboardWidget,
} from "../operator/operator-definition-contract";
export type {
  StudioWorkspaceDefinition,
  DashboardWidgetDefinition,
} from "../operator/operator-definition-contract";
export type {
  OperatorCaller,
  OperatorQueryReader,
} from "../operator/operator-context-contract";
export { defineWorkspaceAction } from "../operator/workspace-action-definition-contract";
export type {
  WorkspaceActionConfirmation,
  WorkspaceActionDefinition,
  WorkspacePreparedConfirmation,
} from "../operator/workspace-action-definition-contract";
export { defineEntityCatalog } from "../operator/operator-view-contract";
export type {
  StudioWorkspaceView,
  StudioWorkspaceViewBlock,
  DashboardDigest,
  DashboardOperatorView,
  DashboardOperatorViewBlock,
  OperatorCapabilityDefinition,
  OperatorEntityCatalogDefinition,
  OperatorView,
  OperatorCardBlock,
  OperatorColumnsBlock,
  OperatorRegionBlock,
  OperatorViewStatus,
  OperatorViewBlock,
  WorkspaceActionFormControl,
  WorkspaceActionFormDefinition,
  WorkspaceActionFormFieldDefinition,
  WorkspaceActionFormFieldMap,
  WorkspaceActionFormOption,
  WorkspaceActionResultDefinition,
  WorkspaceActionResultFieldDefinition,
  WorkspaceActionResultFieldMap,
} from "../operator/operator-view-contract";
export {
  defineBusContract,
  defineJob,
  defineTool,
} from "../service/service-definition-contract";
export { contentGenerationResultSchema } from "@brains/content-service";
export type {
  AnyServiceJobDefinition,
  AnyServiceToolDefinition,
  ServiceAnswer,
  ServiceAnswerContext,
  ServiceBusDelivery,
  ServiceContentGeneration,
  ServiceContentGenerationContext,
  ServiceContentGenerationItem,
  ServiceContentGenerationResult,
  ServiceContentGenerationSkipReason,
  ServiceContentGenerationTarget,
  ServiceContentGenerationTargetInput,
  ServiceDeadline,
  ServiceDefinitionBehavior,
  ServiceDefinitionHeader,
  ServiceDefinitionHeaderInput,
  ServiceEntityAccess,
  OwnedEntityWriter,
  ServiceEntityIdPath,
  ServiceInputSchema,
  ServiceJobBinding,
  ServiceJobDefinition,
  ServiceJobHandler,
  ServiceJobHandlerContext,
  ServiceJobProgress,
  ServiceJobReference,
  ServiceJobs,
  ServiceJobStatus,
  ServiceLifecycle,
  ServiceMessagePublisher,
  ServiceMessaging,
  ServiceProgressReporter,
  ServicePromptDefinition,
  ServiceRuntimeState,
  ServiceRuntimeStateOptions,
  ServiceRuntimeStateRecord,
  ServiceSetupContext,
  ServiceSubscriptionBinding,
  ServiceResourceDefinition,
  ServiceSchema,
  ServiceSchemaMap,
  ServiceTemplateDefinition,
  ServiceTemplateFormatter,
  ServiceTemplateGenerationDefinition,
  ServiceToolDefinition,
} from "../service/service-definition-contract";

export type ServicePackageDefinition<
  TConfigSchema extends z.ZodType<object, object>,
> = PluginPackageDefinition<TConfigSchema, "service">;

function createServicePackage<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TPromptSchemas extends ServiceSchemaMap,
  TTemplateSchemas extends ServiceSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TTemplateDefinitions extends ServiceTemplateShapeMap,
  TEntities extends readonly AnyEntityDefinition[],
>(
  definition: NormalizedServiceDefinitionInput<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TAccountSettings,
    TTemplateDefinitions,
    TEntities
  >,
  // Installed on the owned types, as an entity package installs its own:
  // a first-party service keeps the data sources its class registered.
  dataSources: readonly AnyDataSourceDeclaration[] = [],
  // What a first-party service converted from a class declares beside its
  // definition (withTools).
  declarations: FirstPartyServiceDeclarations = noFirstPartyServiceDeclarations,
): ServicePackageDefinition<TConfigSchema> {
  const entities = definition.entities;
  assertDataSources(definition.id, new Set(entities), dataSources);
  const created = createPluginPackageDefinition({
    family: "service",
    id: definition.id,
    config: definition.config,
    // The owned types come first, so each exists before the service that
    // writes it registers, exactly as an entity package installs them.
    instantiate: ({
      config,
      package: metadata,
      scope,
      pluginId,
      dependencies,
      ownedTypePluginId,
    }) => [
      ...createEntityPackagePlugins(
        entities,
        [],
        metadata,
        pluginId === undefined
          ? scope
          : legacyOwnedScope(
              definition.id,
              entities,
              pluginId,
              ownedTypePluginId,
            ),
        dataSources,
      ),
      createDeclarativeServicePlugin(
        definition,
        config,
        metadata,
        pluginId ?? scope(definition.id),
        dependencies ?? [],
        declarations,
      ),
    ],
  });
  rebuilders.set(created, (sources) =>
    createServicePackage(definition, sources, declarations),
  );
  registerServiceRebuilder(created, declarations, (declared) =>
    createServicePackage(definition, dataSources, declared),
  );
  return created;
}

/** How each service package is rebuilt with data sources on its owned types. */
const rebuilders = new WeakMap<
  PluginPackageDefinition,
  (
    dataSources: readonly AnyDataSourceDeclaration[],
  ) => ServicePackageDefinition<z.ZodType<object, object>>
>();

/**
 * Internal, first-party only: a service package that also installs data
 * sources on the types its header owns, as an entity package installs its
 * own: scoped as the owned type's plugin is, read at the build's scope. A
 * first-party service converted from an entity plugin class keeps the data
 * sources its class registered, such as site-info's `site-info:entities`.
 * The public service contract declares no data sources.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-service-runtime).
 */
export function withOwnedDataSources(
  definition: ServicePackageDefinition<z.ZodType<object, object>>,
  dataSources: readonly AnyDataSourceDeclaration[],
): ServicePackageDefinition<z.ZodType<object, object>> {
  const rebuild = rebuilders.get(definition);
  if (!rebuild) {
    throw new Error(
      `Service definition "${definition.id}" was not created by defineServicePlugin`,
    );
  }
  return rebuild(Object.freeze([...dataSources]));
}

/**
 * Names for the types a first-party service keeps from its class: each
 * installed under the type itself, as an entity plugin class was named
 * after the type it registered, and a type named like the service under the
 * plugin id the composer names for it (`ownedTypePluginId`). With one type,
 * every other name scoped to it follows that type's id; with several, as a
 * class registering several types inside itself named them, it follows the
 * service's id.
 */
function legacyOwnedScope(
  serviceId: string,
  entities: readonly AnyEntityDefinition[],
  pluginId: string,
  /** Where the type installs when the service keeps the type's own id. */
  ownedTypePluginId: string | undefined,
): (localId: string) => string {
  const named = entities.find(({ type }) => type === pluginId);
  if (named && ownedTypePluginId === undefined) {
    throw new Error(
      `Service "${serviceId}" cannot keep legacy plugin id "${pluginId}", which its entity type is installed under`,
    );
  }
  // One type takes the composer's id even when named otherwise, as
  // site-content-entity is; of several, only the one named like the service.
  const typePluginId = (type: string): string =>
    type === pluginId || entities.length === 1
      ? (ownedTypePluginId ?? type)
      : type;
  const types = new Set(entities.map(({ type }) => type));
  const [only, ...rest] = entities;
  const namesFollow =
    only === undefined || rest.length > 0 ? pluginId : typePluginId(only.type);
  return (localId) => {
    assertIdentifier(localId, "Local plugin id");
    if (only === undefined) return localId;
    return types.has(localId)
      ? typePluginId(localId)
      : `${namesFollow}:${localId}`;
  };
}

/** What a service header and its behavior may declare. */
const serviceSlots: TwoStageSlots = {
  label: "Service",
  helper: "defineServicePlugin",
  header: new Set(["id", "config", "entities", "setup", "accountSettings"]),
  behavior: new Set([
    "instructions",
    "resources",
    "prompts",
    "templates",
    "jobs",
    "tools",
    "subscriptions",
    "routes",
    "dashboardWidgets",
    "studioWorkspaces",
  ]),
};

/** Both plugins scope to the package, so a type and the service cannot share a name. */
function assertOwnedEntities(
  serviceId: string,
  entities: readonly AnyEntityDefinition[],
): void {
  const types = entities.map(({ type }) => type);
  const twice = types.find((type, index) => types.indexOf(type) !== index);
  if (twice !== undefined) {
    throw new Error(
      `Service "${serviceId}" declares entity type "${twice}" more than once`,
    );
  }
  if (types.includes(serviceId)) {
    throw new Error(
      `Service "${serviceId}" declares an entity type of the same name; give one of them a distinct id`,
    );
  }
}

/**
 * A service package, declared in two halves: the header says what the package
 * is, what it owns and what it sets up; the behavior says what it does with
 * that. Behavior is checked against the state the header already fixed, so
 * its slots may be written in any order.
 */
export function defineServicePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object = Record<never, never>,
  TPromptSchemas extends ServiceSchemaMap = Record<never, never>,
  TTemplateSchemas extends ServiceSchemaMap = Record<never, never>,
  TAccountSettings extends AnyAccountSettingsDefinition =
    AnyAccountSettingsDefinition,
  TTemplateDefinitions extends ServiceTemplateShapeMap = Record<never, never>,
  const TEntities extends readonly AnyEntityDefinition[] = readonly [],
>(
  header: ServiceDefinitionHeaderInput<
    TConfigSchema,
    TState,
    TAccountSettings,
    TEntities
  >,
  behavior?: ServiceDefinitionBehavior<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TAccountSettings,
    TTemplateDefinitions,
    TEntities[number]
  >,
): ServicePackageDefinition<TConfigSchema>;
export function defineServicePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object = Record<never, never>,
  TPromptSchemas extends ServiceSchemaMap = Record<never, never>,
  TTemplateSchemas extends ServiceSchemaMap = Record<never, never>,
  TAccountSettings extends undefined = undefined,
  TTemplateDefinitions extends ServiceTemplateShapeMap = Record<never, never>,
  const TEntities extends readonly AnyEntityDefinition[] = readonly [],
>(
  header: ServiceDefinitionHeaderInput<
    TConfigSchema,
    TState,
    TAccountSettings,
    TEntities
  >,
  behavior?: ServiceDefinitionBehavior<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TAccountSettings,
    TTemplateDefinitions,
    TEntities[number]
  >,
): ServicePackageDefinition<TConfigSchema>;
export function defineServicePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TPromptSchemas extends ServiceSchemaMap,
  TTemplateSchemas extends ServiceSchemaMap,
  TTemplateDefinitions extends ServiceTemplateShapeMap,
  TEntities extends readonly AnyEntityDefinition[],
>(
  header:
    | ServiceDefinitionHeaderInput<
        TConfigSchema,
        TState,
        AnyAccountSettingsDefinition,
        TEntities
      >
    | ServiceDefinitionHeaderInput<TConfigSchema, TState, undefined, TEntities>,
  behavior?: ServiceDefinitionBehavior<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    AnyAccountSettingsDefinition | undefined,
    TTemplateDefinitions,
    TEntities[number]
  >,
): ServicePackageDefinition<TConfigSchema> {
  assertTwoStageSlots(serviceSlots, header, behavior);
  assertOwnedEntities(header.id, header.entities ?? []);
  // The split exists so the state type is known before behavior is checked;
  // the runtime reads one declaration. Account settings are the header's,
  // present or absent, and the owned types are copied so later edits to the
  // author's array have no effect.
  return createServicePackage({
    ...behavior,
    ...header,
    entities: Object.freeze(
      header.entities === undefined ? [] : [...header.entities],
    ),
    accountSettings: header.accountSettings,
  });
}
