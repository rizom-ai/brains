import { createClient, type Client } from "@libsql/client";
import {
  EntityRegistry,
  EntityService,
  type EntityTypeConfig,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  AnchorProfileAdapter,
  BrainCharacterAdapter,
} from "@brains/identity-service";
import type { Plugin } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { computeContentHash } from "@brains/utils/hash";
import { canonicalBrain } from "../../src/model/canonical-brain";

/** A stored row, as the database holds it. */
export interface StoredDocument {
  content: string;
  updated: number;
}

export interface CanonicalEntityStore {
  service: EntityService;
  /** Every text type the store registers, sorted. */
  textTypes: readonly string[];
  stored(entityType: string, id: string): Promise<StoredDocument | null>;
  /** Put a row back as an earlier release stored it, last written long ago. */
  storeAsBefore(entityType: string, id: string, content: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * Every entity type the canonical brain registers, and the two the shell
 * registers, on one real entity store, each with the adapter and config
 * its plugin gives it: what the stored-form contract runs every type
 * through. Plugins are installed on a test harness only to collect their
 * types; nothing they subscribe to runs against this store.
 */
export async function canonicalEntityStore(): Promise<CanonicalEntityStore> {
  const harness = createPluginHarness({
    dataDir: "/tmp/canonical-entity-store",
    domain: "brain.test",
  });
  for (const [, factory, defaults] of canonicalBrain.capabilities) {
    let plugins: Plugin | Plugin[];
    try {
      plugins = factory(typeof defaults === "function" ? {} : (defaults ?? {}));
    } catch {
      // A capability whose defaults need a deployment's config (the OAuth
      // broker) registers no entity type.
      continue;
    }
    for (const plugin of [plugins].flat()) {
      try {
        await harness.installPlugin(plugin);
      } catch {
        // A plugin that cannot install on a bare test harness (one that
        // needs HTTP, or a shell type it extends) registers its types first
        // or none; the types it registered are still collected.
      }
    }
  }
  const collected = harness.getEntityRegistry();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  const shellTypes = new Map<string, EntityTypeConfig>([
    [
      "anchor-profile",
      { classification: "system", projectionSourceRole: "canonical" },
    ],
    [
      "brain-character",
      {
        classification: "system",
        projectionSource: false,
        projectionSourceRole: "excluded",
      },
    ],
  ]);
  const anchor = new AnchorProfileAdapter();
  registry.registerEntityType(
    anchor.entityType,
    anchor.schema,
    anchor,
    shellTypes.get(anchor.entityType),
  );
  const character = new BrainCharacterAdapter();
  registry.registerEntityType(
    character.entityType,
    character.schema,
    character,
    shellTypes.get(character.entityType),
  );
  for (const type of collected.getAllEntityTypes()) {
    if (shellTypes.has(type)) continue;
    const adapter = collected.getAdapter(type);
    registry.registerEntityType(
      type,
      adapter.schema,
      adapter,
      collected.getEntityTypeConfig(type),
    );
  }

  const temporary = await createTestDirectory();
  const dbConfig = { url: `file:${temporary.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${temporary.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: harness.getMockShell().getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService: {
      identity: { model: "test:none", dimensions: 1536, promptRevision: 0 },
      embedQuery: async () => {
        throw new Error("Unexpected embedding");
      },
      embedDocuments: async () => {
        throw new Error("Unexpected embedding");
      },
    },
  });
  await service.initialize();
  const db: Client = createClient(dbConfig);
  const textTypes = registry
    .getAllEntityTypes()
    .filter(
      (type) => registry.getEntityTypeConfig(type).binaryStorage === undefined,
    )
    .sort();
  return {
    service,
    textTypes,
    async stored(entityType, id): Promise<StoredDocument | null> {
      const result = await db.execute({
        sql: "SELECT content, updated FROM entities WHERE entityType = ? AND id = ?",
        args: [entityType, id],
      });
      const row = result.rows[0];
      return row
        ? { content: String(row["content"]), updated: Number(row["updated"]) }
        : null;
    },
    async storeAsBefore(entityType, id, content): Promise<void> {
      await db.execute({
        sql: "UPDATE entities SET content = ?, contentHash = ?, updated = ? WHERE entityType = ? AND id = ?",
        args: [
          content,
          computeContentHash(content),
          Date.UTC(2026, 0, 1),
          entityType,
          id,
        ],
      });
    },
    async close(): Promise<void> {
      db.close();
      service.close();
      await temporary.cleanup();
    },
  };
}
