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
  InfrastructureAccess,
  NormalizedServiceDefinitionInput,
  ServiceDefinitionBehavior,
  ServiceDefinitionHeaderInput,
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
export {
  defineJob,
  defineTool,
  // The token a package that *is* infrastructure names to be given the
  // process role, the git broker and the entity mirror. Ordinary authoring
  // never writes it. Named consumer: @brains/directory-sync.
  infrastructure,
} from "../service/service-definition-contract";
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
  ServiceActiveJob,
  ServiceRecentJob,
  ServiceJobs,
  ServiceJobHooks,
  ServiceJobSettledContext,
  ServiceJobSettledHandler,
  ServiceBatchOperation,
  ServiceBatchOptions,
  ServiceBatchReference,
  ServiceBatchStatus,
  InfrastructureAccess,
  ServiceGitBroker,
  ServiceInfrastructureContext,
  ServiceRole,
} from "../service/service-definition-contract";
export type {
  EntityMirror,
  EntityMirrorClient,
} from "../service/entity-mirror";
export type {
  ServiceJobStatus,
  ServiceLifecycle,
  ServiceMessagePublisher,
  ServiceProgressReporter,
  ServicePublisher,
  ServicePromptDefinition,
  ServicePublishDeclaration,
  ServiceResourceDefinition,
  ServiceChannelReader,
  ServiceEntityShapes,
  ServiceRenderSchema,
  ServiceSchema,
  ServiceSchemaMap,
  ServiceTemplateDefinition,
  ServiceTemplateFormatter,
  ServiceTemplateReads,
  ServiceToolDefinition,
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
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TInfrastructure extends InfrastructureAccess | undefined,
>(
  definition: NormalizedServiceDefinitionInput<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TAccountSettings,
    TInfrastructure
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
  TAccountSettings extends AnyAccountSettingsDefinition =
    AnyAccountSettingsDefinition,
  TInfrastructure extends InfrastructureAccess | undefined = undefined,
>(
  header: ServiceDefinitionHeaderInput<
    TConfigSchema,
    TState,
    TAccountSettings,
    TInfrastructure
  >,
  behavior?: ServiceDefinitionBehavior<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TAccountSettings
  >,
): ServicePackageDefinition<TConfigSchema>;
export function defineServicePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object = Record<never, never>,
  TPromptSchemas extends ServiceSchemaMap = Record<never, never>,
  TTemplateSchemas extends ServiceSchemaMap = Record<never, never>,
  TAccountSettings extends undefined = undefined,
  TInfrastructure extends InfrastructureAccess | undefined = undefined,
>(
  header: ServiceDefinitionHeaderInput<
    TConfigSchema,
    TState,
    TAccountSettings,
    TInfrastructure
  >,
  behavior?: ServiceDefinitionBehavior<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TAccountSettings
  >,
): ServicePackageDefinition<TConfigSchema>;
export function defineServicePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TPromptSchemas extends ServiceSchemaMap,
  TTemplateSchemas extends ServiceSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TInfrastructure extends InfrastructureAccess | undefined,
>(
  header: ServiceDefinitionHeaderInput<
    TConfigSchema,
    TState,
    TAccountSettings,
    TInfrastructure
  >,
  behavior?: ServiceDefinitionBehavior<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TAccountSettings
  >,
): ServicePackageDefinition<TConfigSchema> {
  // What the package is, and what it does with it, are one declaration from
  // here on: the split exists so the state type is known before the behavior
  // is checked, not because the runtime wants two objects.
  const definition: ServiceDefinitionInput<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TAccountSettings,
    TInfrastructure
  > = { ...header, ...behavior };
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
  // The header's account settings, present or absent, are the definition's:
  // the two branches this used to take differed only in which literal type
  // they named, and the header now carries that type for both.
  const normalized: NormalizedServiceDefinitionInput<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TAccountSettings,
    TInfrastructure
  > = {
    ...definition,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the header type is a conditional on TAccountSettings: the declaration in one arm, undefined in the other, which is what TAccountSettings is in each. The compiler cannot resolve a conditional over a parameter it has not fixed, and an implementation signature that names the property outright is rejected as incompatible with the overloads.
    accountSettings: header.accountSettings as TAccountSettings,
  };
  return createServicePackage(normalized);
}
