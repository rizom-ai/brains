import type { z } from "@brains/utils/zod";
import {
  createPluginPackageDefinition,
  type PluginPackageDefinition,
} from "../package-definition";
import { createDeclarativeServicePlugin } from "../service/declarative-service-plugin";
import type {
  ServiceDefinitionInput,
  ServiceSchemaMap,
} from "../service/service-definition-contract";

export { defineJob, defineTool } from "../service/service-definition-contract";
export type {
  AnyServiceJobDefinition,
  AnyServiceToolDefinition,
  ServiceDeadline,
  ServiceDefinitionInput,
  ServiceEntityReader,
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

export function defineServicePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object = Record<never, never>,
  TPromptSchemas extends ServiceSchemaMap = Record<never, never>,
  TTemplateSchemas extends ServiceSchemaMap = Record<never, never>,
  TViewSchemas extends ServiceSchemaMap = Record<never, never>,
>(
  definition: ServiceDefinitionInput<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TViewSchemas
  >,
): ServicePackageDefinition<TConfigSchema> {
  return createPluginPackageDefinition({
    family: "service",
    id: definition.id,
    config: definition.config,
    instantiate: ({ config, package: metadata, scope }) =>
      createDeclarativeServicePlugin(
        definition,
        config,
        metadata,
        scope(definition.id),
      ),
  });
}
