import type { z } from "@brains/utils/zod";
import {
  createPluginPackageDefinition,
  type PluginPackageDefinition,
} from "../package-definition";
import { createDeclarativeServicePlugin } from "../service/declarative-service-plugin";
import { createEntityPackagePlugins } from "../entity/declarative-entity-plugin";
import type { AnyEntityDefinition } from "../entity/entity-definition-contract";
import type { AnyAccountSettingsDefinition } from "../operator/account-settings-definition-contract";
import type {
  NormalizedServiceDefinitionInput,
  ServiceDefinitionBehavior,
  ServiceDefinitionHeaderInput,
  ServiceSchemaMap,
  ServiceViewSchemaMap,
  ServiceTemplateShapeMap,
} from "../service/service-definition-contract";

export { defineAccountSettings } from "../operator/account-settings-definition-contract";
export type {
  AccountSettingsDefinition,
  AccountSettingsFieldDefinition,
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
  OperatorEntityReader,
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
export { defineJob, defineTool } from "../service/service-definition-contract";
export { contentGenerationResultSchema } from "@brains/content-service";
export type {
  AnyServiceJobDefinition,
  AnyServiceToolDefinition,
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
  ServiceProgressReporter,
  ServicePromptDefinition,
  ServiceRuntimeState,
  ServiceRuntimeStateOptions,
  ServiceRuntimeStateRecord,
  ServiceSetupContext,
  ServiceResourceDefinition,
  ServiceSchema,
  ServiceSchemaMap,
  ServiceViewSchemaMap,
  ServiceTemplateDefinition,
  ServiceTemplateFormatter,
  ServiceTemplateGenerationDefinition,
  ServiceToolDefinition,
  ServiceViewDefinition,
} from "../service/service-definition-contract";

export type ServicePackageDefinition<
  TConfigSchema extends z.ZodType<object, object>,
> = PluginPackageDefinition<TConfigSchema, "service">;

function createServicePackage<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TPromptSchemas extends ServiceSchemaMap,
  TTemplateSchemas extends ServiceSchemaMap,
  TViewSchemas extends ServiceViewSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TTemplateDefinitions extends ServiceTemplateShapeMap,
  TEntities extends readonly AnyEntityDefinition[],
>(
  definition: NormalizedServiceDefinitionInput<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TViewSchemas,
    TAccountSettings,
    TTemplateDefinitions,
    TEntities
  >,
): ServicePackageDefinition<TConfigSchema> {
  const entities = definition.entities;
  return createPluginPackageDefinition({
    family: "service",
    id: definition.id,
    config: definition.config,
    // The owned types come first, so each exists before the service that
    // writes it registers, exactly as an entity package installs them.
    instantiate: ({ config, package: metadata, scope }) => [
      ...createEntityPackagePlugins(entities, [], metadata, scope),
      createDeclarativeServicePlugin(
        definition,
        config,
        metadata,
        scope(definition.id),
      ),
    ],
  });
}

/** What a service header may declare; everything else is behavior. */
const serviceHeaderKeys: ReadonlySet<string> = new Set([
  "id",
  "config",
  "entities",
  "setup",
  "accountSettings",
]);

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
  TViewSchemas extends ServiceViewSchemaMap = Record<never, never>,
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
    TViewSchemas,
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
  TViewSchemas extends ServiceViewSchemaMap = Record<never, never>,
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
    TViewSchemas,
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
  TViewSchemas extends ServiceViewSchemaMap,
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
    TViewSchemas,
    AnyAccountSettingsDefinition | undefined,
    TTemplateDefinitions,
    TEntities[number]
  >,
): ServicePackageDefinition<TConfigSchema> {
  // The types refuse behavior in the header; an untyped author is told too,
  // rather than having a misplaced slot work by accident.
  const misplaced = Object.keys(header).find(
    (key) => !serviceHeaderKeys.has(key),
  );
  if (misplaced !== undefined) {
    throw new Error(
      `Service "${header.id}" declares "${misplaced}" in its header; behavior is defineServicePlugin's second argument`,
    );
  }
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
