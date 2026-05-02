import type {
  BaseEntity,
  CreateInterceptor,
  DataSource,
  EntityAdapter,
  EntityTypeConfig,
  IEntityService,
} from "@brains/entity-service";
import type { z } from "@brains/utils";
import type { IShell } from "../interfaces";
import { resolvePrompt } from "./prompt-resolver";
import type { IEntitiesNamespace, IPromptsNamespace } from "./context";

/**
 * Create the shared entity-management namespace used by entity and service
 * plugin contexts.
 */
export function createEntitiesNamespace(shell: IShell): IEntitiesNamespace {
  const entityService = shell.getEntityService();
  const entityRegistry = shell.getEntityRegistry();
  const dataSourceRegistry = shell.getDataSourceRegistry();

  return {
    register: <T extends BaseEntity>(
      entityType: string,
      schema: z.ZodSchema<T>,
      adapter: EntityAdapter<T>,
      config?: EntityTypeConfig,
    ): void => {
      entityRegistry.registerEntityType(entityType, schema, adapter, config);
    },
    getAdapter: <T extends BaseEntity>(
      entityType: string,
    ): EntityAdapter<T> | undefined => {
      try {
        return entityRegistry.getAdapter<T>(entityType);
      } catch {
        return undefined;
      }
    },
    extendFrontmatterSchema: (
      type: string,
      extension: z.ZodObject<z.ZodRawShape>,
    ): void => {
      entityRegistry.extendFrontmatterSchema(type, extension);
    },
    getEffectiveFrontmatterSchema: (
      type: string,
    ): z.ZodObject<z.ZodRawShape> | undefined => {
      return entityRegistry.getEffectiveFrontmatterSchema(type);
    },
    registerCreateInterceptor: (
      entityType: string,
      interceptor: CreateInterceptor,
    ): void => {
      entityRegistry.registerCreateInterceptor(entityType, interceptor);
    },
    update: async <T extends BaseEntity>(
      entity: T,
    ): Promise<{ entityId: string; jobId: string }> => {
      return entityService.updateEntity(entity);
    },
    registerDataSource: (dataSource: DataSource): void => {
      dataSourceRegistry.register(dataSource);
    },
  };
}

/** Create the shared prompt-resolution namespace. */
export function createPromptsNamespace(
  entityService: IEntityService,
): IPromptsNamespace {
  return {
    resolve: (target: string, fallback: string): Promise<string> => {
      return resolvePrompt(entityService, target, fallback);
    },
  };
}
