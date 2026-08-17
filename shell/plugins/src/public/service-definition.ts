import type { z } from "@brains/utils/zod";
import {
  createPluginPackageDefinition,
  type PluginPackageDefinition,
} from "../package-definition";
import { createDeclarativeServicePlugin } from "../service/declarative-service-plugin";
import { createEntityPackagePlugins } from "../entity/declarative-entity-plugin";
import type { AnyAccountSettingsDefinition } from "../operator/account-settings-definition-contract";
import type {
  NormalizedServiceDefinitionInput,
  ServiceDefinitionInput,
  ServiceSchemaMap,
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
export type {
  AnyServiceJobDefinition,
  AnyServiceToolDefinition,
  ServiceDeadline,
  ServiceDefinitionInput,
  ServiceEntityAccess,
  ServiceEntityReader,
  ServiceEvalHandler,
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
  ServiceResourceDefinition,
  ServiceSchema,
  ServiceSchemaMap,
  ServiceTemplateDefinition,
  ServiceTemplateFormatter,
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
  TViewSchemas extends ServiceSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
>(
  definition: NormalizedServiceDefinitionInput<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TViewSchemas,
    TAccountSettings
  >,
): ServicePackageDefinition<TConfigSchema> {
  return createPluginPackageDefinition({
    family: "service",
    id: definition.id,
    config: definition.config,
    instantiate: ({ config, package: metadata, scope }) => [
      createDeclarativeServicePlugin(
        definition,
        config,
        metadata,
        scope(definition.id),
      ),
      // One entity plugin per declared type, exactly as an entity package
      // produces. A package that stores something and also does configured
      // work declares both here rather than shipping as two packages.
      ...createEntityPackagePlugins(
        definition.entities ?? [],
        definition.projections ?? [],
        metadata,
        scope,
      ),
    ],
  });
}

export function defineServicePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object = Record<never, never>,
  TPromptSchemas extends ServiceSchemaMap = Record<never, never>,
  TTemplateSchemas extends ServiceSchemaMap = Record<never, never>,
  TViewSchemas extends ServiceSchemaMap = Record<never, never>,
  TAccountSettings extends AnyAccountSettingsDefinition =
    AnyAccountSettingsDefinition,
>(
  definition: ServiceDefinitionInput<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TViewSchemas,
    TAccountSettings
  >,
): ServicePackageDefinition<TConfigSchema>;
export function defineServicePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object = Record<never, never>,
  TPromptSchemas extends ServiceSchemaMap = Record<never, never>,
  TTemplateSchemas extends ServiceSchemaMap = Record<never, never>,
  TViewSchemas extends ServiceSchemaMap = Record<never, never>,
  TAccountSettings extends undefined = undefined,
>(
  definition: ServiceDefinitionInput<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TViewSchemas,
    TAccountSettings
  >,
): ServicePackageDefinition<TConfigSchema>;
export function defineServicePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TPromptSchemas extends ServiceSchemaMap,
  TTemplateSchemas extends ServiceSchemaMap,
  TViewSchemas extends ServiceSchemaMap,
>(
  definition:
    | ServiceDefinitionInput<
        TConfigSchema,
        TState,
        TPromptSchemas,
        TTemplateSchemas,
        TViewSchemas,
        AnyAccountSettingsDefinition
      >
    | ServiceDefinitionInput<
        TConfigSchema,
        TState,
        TPromptSchemas,
        TTemplateSchemas,
        TViewSchemas,
        undefined
      >,
): ServicePackageDefinition<TConfigSchema> {
  if (definition.accountSettings !== undefined) {
    const normalized: NormalizedServiceDefinitionInput<
      TConfigSchema,
      TState,
      TPromptSchemas,
      TTemplateSchemas,
      TViewSchemas,
      AnyAccountSettingsDefinition
    > = { ...definition, accountSettings: definition.accountSettings };
    return createServicePackage(normalized);
  }
  const normalized: NormalizedServiceDefinitionInput<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TViewSchemas,
    undefined
  > = { ...definition, accountSettings: undefined };
  return createServicePackage(normalized);
}
