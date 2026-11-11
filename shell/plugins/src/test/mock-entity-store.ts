import {
  generateMarkdown,
  readMarkdownFrontmatter,
} from "@brains/utils/markdown-frontmatter";
import {
  preserveSourceFrontmatter,
  type BaseEntity,
  type EntityAdapter,
  type EntityExportIntent,
  type EntityMutationReceipt,
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
  readonly mutationReceipts: Map<string, EntityMutationReceipt>;
  readonly types: Set<string>;
  readonly adapters: Map<string, EntityAdapter<BaseEntity>>;
  readonly typeConfigs: Map<string, EntityTypeConfig | undefined>;
  /** The registered config for a type, or an empty one. */
  typeConfig(type: string): EntityTypeConfig;
  /**
   * Serialize the way the real EntityService does: the adapter rebuilds
   * markdown from the entity's fields and extracts its canonical metadata.
   */
  serialize(
    entity: BaseEntity,
    stored?: string,
  ): {
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
    mutationReceipts: new Map(),
    types,
    adapters,
    typeConfigs,

    typeConfig: (type): EntityTypeConfig => typeConfigs.get(type) ?? {},

    exportKey,

    serialize: (
      entity,
      stored,
    ): { content: string; metadata: Record<string, unknown> } => {
      const adapter = adapters.get(entity.entityType);
      // Fall back to verbatim when no real adapter is registered. Some tests
      // register entity types with a stub (`{} as never`) to satisfy the
      // registry signature without caring about serialization.
      if (typeof adapter?.toMarkdown !== "function") {
        return { content: entity.content, metadata: entity.metadata };
      }
      const serialized = adapter.toMarkdown(entity);
      const metadata = adapter.extractMetadata(entity);
      // As the real serializer keeps it, for a type whose metadata is its
      // frontmatter: the header the document carries beyond the type's own
      // stays in the file, once; an update that hands over a body alone
      // keeps the stored header the type does not write.
      if (adapter.metadataFromFrontmatter !== true) {
        return { content: serialized, metadata };
      }
      const source =
        stored !== undefined && !hasFrontmatter(entity.content)
          ? unwrittenHeader(stored, serialized)
          : entity.content;
      return {
        content: preserveSourceFrontmatter(
          source,
          serialized,
          adapter.frontmatterSchema,
          [],
          [],
          [...(typeConfigs.get(entity.entityType)?.retiredFields ?? [])],
        ),
        metadata,
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

/** Whether a document carries frontmatter of its own. */
function hasFrontmatter(content: string): boolean {
  const { data } = readMarkdownFrontmatter(content);
  return (
    typeof data === "object" && data !== null && Object.keys(data).length > 0
  );
}

/** The stored header the written document does not state, as the real serializer keeps it. */
function unwrittenHeader(stored: string, serialized: string): string {
  const storedFields = readMarkdownFrontmatter(stored).data;
  const written = readMarkdownFrontmatter(serialized).data;
  if (typeof storedFields !== "object" || storedFields === null) return "";
  const kept = Object.fromEntries(
    Object.entries(storedFields).filter(
      ([key]) =>
        typeof written !== "object" ||
        written === null ||
        !Object.hasOwn(written, key),
    ),
  );
  return Object.keys(kept).length > 0 ? generateMarkdown(kept, "") : "";
}
