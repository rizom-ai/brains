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
  ServiceDefinitionInput,
  ServiceSchemaMap,
  ServiceViewSchemaMap,
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
  OperatorDetailBlock,
  OperatorPanelBlock,
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
// A tool that *is* the conversation reaches the brain and may answer with
// what the brain asked back. Named consumer: @brains/mcp.
export type {
  ToolAgent,
  ToolAgentAnswer,
  ToolAsk,
} from "../service/tool-agent";
export type {
  AnyServiceJobDefinition,
  AnyServiceToolDefinition,
  ServiceCheckDeclaration,
  ServiceCorpusHit,
  ServiceCorpusSearch,
  ServiceJudge,
  ServiceDeadline,
  ServiceDefinitionInput,
  ServiceEntityExtension,
  ServiceInteractionDeclaration,
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
  ServicePublishDeclaration,
  ServiceResourceDefinition,
  ServiceSchema,
  ServiceSchemaMap,
  ServiceViewSchemaMap,
  ServiceTemplateDefinition,
  ServiceTemplateFormatter,
  ServiceToolDefinition,
  ServiceViewDefinition,
} from "../service/service-definition-contract";

/**
 * Where a template a package declared ends up once the runtime scopes it.
 *
 * Templates are declared on an entity and registered under that entity
 * plugin's id, so the lookup goes through the declaring entity rather than
 * the service. An undeclared name is an authoring error worth failing on
 * rather than passing through as a string nothing will resolve.
 */
function scopedTemplateName(
  entities: readonly AnyEntityDefinition[],
  scope: (localId: string) => string,
  localName: string,
): string {
  const owner = entities.find(({ templates }) =>
    Object.hasOwn(templates ?? {}, localName),
  );
  if (!owner) {
    throw new Error(
      `No declared entity provides a template named "${localName}"`,
    );
  }
  return `${scope(owner.type)}:${localName}`;
}

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
        scope,
      ),
      // One entity plugin per declared type, exactly as an entity package
      // produces. A package that stores something and also does configured
      // work declares both here rather than shipping as two packages.
      ...createEntityPackagePlugins(
        definition.entities ?? [],
        definition.projections ?? [],
        metadata,
        scope,
        // Jobs this package declares belong to the service plugin, so a
        // create route naming one has to resolve there rather than against
        // the entity plugin that declared the route.
        scope(definition.id),
        definition.projectionRules?.({
          config,
          template: (localName) =>
            scopedTemplateName(definition.entities ?? [], scope, localName),
        }) ?? [],
      ),
    ],
  });
}

export function defineServicePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object = Record<never, never>,
  TPromptSchemas extends ServiceSchemaMap = Record<never, never>,
  TTemplateSchemas extends ServiceSchemaMap = Record<never, never>,
  TViewSchemas extends ServiceViewSchemaMap = Record<never, never>,
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
  TViewSchemas extends ServiceViewSchemaMap = Record<never, never>,
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
  TViewSchemas extends ServiceViewSchemaMap,
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
  // Both plugins scope to `${packageName}:${id}`, so a service sharing an
  // id with a type it declares collides — and the collision surfaces at
  // boot, inside the plugin manager, far from the declaration that caused
  // it. Refuse it where it is written.
  for (const entity of definition.entities ?? []) {
    if (entity.type === definition.id) {
      throw new Error(
        `Service "${definition.id}" declares an entity type of the same name; give one of them a distinct id`,
      );
    }
  }
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
