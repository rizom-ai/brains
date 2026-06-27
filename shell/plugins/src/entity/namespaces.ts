import type {
  BaseEntity,
  CreateInterceptor,
  DataSource,
  UploadSaveHandlerRegistration,
  EntityAdapter,
  EntityTypeConfig,
  IEntityService,
} from "@brains/entity-service";
import type { IShell } from "../interfaces";
import { resolvePrompt } from "./prompt-resolver";
import type { IEntitiesNamespace, IPromptsNamespace } from "./context";

type EntitySchema<TEntity extends BaseEntity> =
  EntityAdapter<TEntity>["schema"];
type FrontmatterSchema = NonNullable<
  EntityAdapter<BaseEntity>["frontmatterSchema"]
>;

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
      schema: EntitySchema<T>,
      adapter: EntityAdapter<T>,
      config?: EntityTypeConfig,
    ): void => {
      entityRegistry.registerEntityType(entityType, schema, adapter, config);
    },
    getAdapter: (entityType: string): EntityAdapter<BaseEntity> | undefined => {
      try {
        return entityRegistry.getAdapter(entityType);
      } catch {
        return undefined;
      }
    },
    extendFrontmatterSchema: (
      type: string,
      extension: FrontmatterSchema,
    ): void => {
      entityRegistry.extendFrontmatterSchema(type, extension);
    },
    getEffectiveFrontmatterSchema: (
      type: string,
    ): FrontmatterSchema | undefined => {
      return entityRegistry.getEffectiveFrontmatterSchema(type);
    },
    registerCreateInterceptor: (
      entityType: string,
      interceptor: CreateInterceptor,
    ): void => {
      entityRegistry.registerCreateInterceptor(entityType, interceptor);
    },
    registerUploadSaveHandler: (
      registration: UploadSaveHandlerRegistration,
    ): void => {
      entityRegistry.registerUploadSaveHandler(registration);
    },
    update: async <T extends BaseEntity>(
      entity: T,
    ): Promise<{ entityId: string; jobId: string }> => {
      return entityService.updateEntity({ entity: entity });
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
