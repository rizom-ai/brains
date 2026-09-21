import {
  copyEntityTypeConfig,
  type BaseEntity,
  type CreateInterceptor,
  type EntityAdapter,
  type IEntityRegistry,
  type UploadSaveHandlerRegistration,
} from "@brains/entity-service";
import type { MockEntityStore } from "./mock-entity-store";

/** The registration view over the same state the entity service reads. */
export function createMockEntityRegistry(
  store: MockEntityStore,
): IEntityRegistry {
  // --- Entity Registry ---
  const createInterceptors = new Map<string, CreateInterceptor>();
  const uploadSaveHandlers: UploadSaveHandlerRegistration[] = [];
  const stewardshipClaims = new Map<string, string>();

  const entityRegistry: IEntityRegistry = {
    registerEntityType: (type, _schema, adapter, config) => {
      const registeredConfig = copyEntityTypeConfig(config ?? {});
      store.types.add(type);
      store.adapters.set(type, adapter);
      store.typeConfigs.set(type, registeredConfig);
    },
    unregisterEntityType: (type): void => {
      stewardshipClaims.delete(type);
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
    claimEntityStewardship: (entityType: string, ownerLabel: string): void => {
      if (!store.types.has(entityType)) {
        throw new Error(
          `"${ownerLabel}" cannot steward "${entityType}": the type is not registered`,
        );
      }
      const existing = stewardshipClaims.get(entityType);
      if (existing !== undefined && existing !== ownerLabel) {
        throw new Error(
          `"${ownerLabel}" cannot steward "${entityType}": "${existing}" already stewards it`,
        );
      }
      stewardshipClaims.set(entityType, ownerLabel);
    },
    releaseEntityStewardship: (
      entityType: string,
      ownerLabel: string,
    ): void => {
      if (stewardshipClaims.get(entityType) === ownerLabel) {
        stewardshipClaims.delete(entityType);
      }
    },
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
      const kept = uploadSaveHandlers.filter(
        (existing) => existing.entityType !== registration.entityType,
      );
      uploadSaveHandlers.splice(0, uploadSaveHandlers.length, ...kept);
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
    getEffectiveFrontmatterSchema: (type: string) =>
      store.adapters.get(type)?.frontmatterSchema,
  };

  return entityRegistry;
}
