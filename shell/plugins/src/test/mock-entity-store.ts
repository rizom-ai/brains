import {
  type BaseEntity,
  type EntityAdapter,
  type EntityExportIntent,
  type IEntityRegistry,
} from "@brains/entity-service";

type EntityTypeConfig = NonNullable<
  Parameters<IEntityRegistry["registerEntityType"]>[3]
>;

/**
 * The state the entity doubles share.
 *
 * The service double and the registry double are two views of one store, and
 * the message bus reads it too. Handing that state around as an object rather
 * than closing over it is what lets each double live in its own module — and
 * what makes it visible that they are the same store, not copies of it.
 */
export interface MockEntityStore {
  readonly entities: Map<string, BaseEntity>;
  readonly exportIntents: Map<string, EntityExportIntent>;
  readonly types: Set<string>;
  readonly adapters: Map<string, EntityAdapter<BaseEntity>>;
  readonly typeConfigs: Map<string, EntityTypeConfig | undefined>;
  /** The registered config for a type, or an empty one. */
  typeConfig(type: string): EntityTypeConfig;
  /**
   * Serialize the way the real EntityService does: the adapter rebuilds
   * markdown from the entity's fields and extracts its canonical metadata.
   */
  serialize(entity: BaseEntity): {
    content: string;
    metadata: Record<string, unknown>;
  };
  /** The key an export intent is filed under. */
  exportKey(entityType: string, entityId: string): string;
  /** Record that an entity needs exporting — or that it no longer does. */
  markExportIntent(
    entityType: string,
    entityId: string,
    operation: "upsert" | "delete",
    persistenceOrigin?: "ordinary" | "directory-sync",
  ): void;
}

export function createMockEntityStore(): MockEntityStore {
  const entities = new Map<string, BaseEntity>();
  const exportIntents = new Map<string, EntityExportIntent>();
  const types = new Set<string>();
  const adapters = new Map<string, EntityAdapter<BaseEntity>>();
  const typeConfigs = new Map<string, EntityTypeConfig | undefined>();
  let revision = 0;

  // A separator no entity type or id can contain, so the two parts of the key
  // can never run together into a different pair's key.
  const exportKey = (entityType: string, entityId: string): string =>
    `${entityType}\u0000${entityId}`;

  return {
    entities,
    exportIntents,
    types,
    adapters,
    typeConfigs,

    typeConfig: (type): EntityTypeConfig => typeConfigs.get(type) ?? {},

    exportKey,

    serialize: (
      entity,
    ): { content: string; metadata: Record<string, unknown> } => {
      const adapter = adapters.get(entity.entityType);
      // Fall back to verbatim when no real adapter is registered. Some tests
      // register entity types with a stub (`{} as never`) to satisfy the
      // registry signature without caring about serialization.
      if (typeof adapter?.toMarkdown !== "function") {
        return { content: entity.content, metadata: entity.metadata };
      }
      return {
        content: adapter.toMarkdown(entity),
        metadata: adapter.extractMetadata(entity),
      };
    },

    markExportIntent: (
      entityType,
      entityId,
      operation,
      persistenceOrigin,
    ): void => {
      const key = exportKey(entityType, entityId);
      // A write that came from directory sync is already on disk; marking it
      // for export would send it straight back out again.
      if (persistenceOrigin === "directory-sync") {
        exportIntents.delete(key);
        return;
      }
      revision += 1;
      exportIntents.set(key, {
        entityType,
        entityId,
        operation,
        revision: `mock-export-${revision}`,
        markedAt: revision,
      });
    },
  };
}
