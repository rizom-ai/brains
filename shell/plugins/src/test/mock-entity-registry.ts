import {
  type BaseEntity,
  type CreateInterceptor,
  type EntityAdapter,
  type IEntityRegistry,
  type UploadSaveHandlerRegistration,
} from "@brains/entity-service";
import type { MockEntityStore } from "./mock-entity-store";

/**
 * An EntityRegistry double over the same store the service double reads.
 *
 * Registering a type has to land where the service will look for it, which is
 * why the store is passed in rather than rebuilt here. The interceptors and
 * upload handlers are the registry's own — nothing else reads them.
 */
export function createMockEntityRegistry(
  store: MockEntityStore,
): IEntityRegistry {
  const createInterceptors = new Map<string, CreateInterceptor>();
  const uploadSaveHandlers: UploadSaveHandlerRegistration[] = [];

  const registry: IEntityRegistry = {
    registerEntityType: (type, _schema, adapter, config) => {
      store.types.add(type);
      store.adapters.set(type, adapter);
      store.typeConfigs.set(type, config ?? {});
    },
    unregisterEntityType: (type): void => {
      store.types.delete(type);
      store.adapters.delete(type);
      store.typeConfigs.delete(type);
      createInterceptors.delete(type);
    },
    getSchema: (): never => {
      throw new Error("Not implemented");
    },
    getAdapter: <
      TEntity extends BaseEntity<TMetadata>,
      TMetadata = Record<string, unknown>,
    >(
      type: string,
    ): EntityAdapter<TEntity, TMetadata> => {
      const adapter = store.adapters.get(type);
      if (!adapter) {
        throw new Error(`No adapter registered for entity type: ${type}`);
      }
      // A heterogeneous registry cannot prove the stored adapter matches the
      // caller-chosen T; the real EntityRegistry asserts at exactly this point
      // for the same reason.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see the comment above
      return adapter as EntityAdapter<TEntity, TMetadata>;
    },
    hasEntityType: (type: string) => store.types.has(type),
    validateEntity: (type: string, entity: unknown): BaseEntity => {
      const adapter = store.adapters.get(type);
      if (adapter) return adapter.schema.parse(entity);
      throw new Error(`No schema registered for entity type: ${type}`);
    },
    getAllEntityTypes: () => Array.from(store.types),
    getEntityTypeConfig: store.typeConfig,
    getWeightMap: () => ({}),
    registerCreateInterceptor: (type, interceptor) => {
      createInterceptors.set(type, interceptor);
    },
    getCreateInterceptor: (type) => createInterceptors.get(type),
    registerUploadSaveHandler: (registration): void => {
      uploadSaveHandlers.push(registration);
    },
    getUploadSaveHandler: (mediaType) =>
      uploadSaveHandlers.find((registration) =>
        registration.mediaTypes.some((pattern) =>
          pattern.endsWith("/*")
            ? mediaType.startsWith(pattern.slice(0, -1))
            : mediaType === pattern,
        ),
      ),
    registerPersistValidator: (): void => {},
    getPersistValidator: () => undefined,
    extendFrontmatterSchema: (): void => {},
    getEffectiveFrontmatterSchema: () => undefined,
  };

  return registry;
}
