import { createClient, type Client } from "@libsql/client";
import {
  EntityRegistry,
  EntityService,
  type EntityTypeConfig,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  EntityPlugin,
  SYSTEM_CHANNELS,
  instantiatePluginPackageDefinition,
  type BaseDataSourceContext,
  type DataSourceSchema,
  type PluginPackageDefinition,
  type PluginPackageInstantiationOptions,
} from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { computeContentHash } from "@brains/utils/hash";

/** A stored row, as the database holds it. */
export interface StoredRow {
  content: string;
  contentHash: string;
  metadata: string;
}

export interface DeclaredEntityStore {
  service: EntityService;
  /** Settle startup content, as the shell does once at boot. */
  settleStartupContent(): Promise<void>;
  /** Announce that the startup import ended, as directory-sync does. */
  completeInitialSync(
    outcome: { success: true } | { success: false; error: string },
  ): Promise<void>;
  /** Ask a request contract, as another package would. */
  shell: ReturnType<typeof createMockShell>;
  /** Fetch from a data source the packages registered, by its registered id. */
  fetchData<T>(
    id: string,
    query: unknown,
    schema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T>;
  stored(entityType: string, id: string): Promise<StoredRow | null>;
  /** Rewrite a row as an earlier release stored it: its markdown and metadata. */
  rewrite(
    entityType: string,
    id: string,
    content: string,
    metadata: string,
  ): Promise<void>;
  /** Date a row as written at another time, as an older record is. */
  setCreated(entityType: string, id: string, created: number): Promise<void>;
  close(): Promise<void>;
}

/**
 * A first-party declared package on the brain's own entity store, composed
 * as the canonical brain composes it, with its plugin registered on a test
 * shell so its seeds and subscriptions run.
 */
export async function declaredEntityStore(
  definition: PluginPackageDefinition,
  packageName: string,
  // The plugin id it installs under, or the composer's options in full,
  // such as a service that installs its owned type apart.
  pluginId: string | PluginPackageInstantiationOptions,
  // Each type's config, or one per type when the package owns several
  // that differ, as a book's sections are contained in their book.
  config: EntityTypeConfig | ((entityType: string) => EntityTypeConfig) = {},
  // Packages installed beside it under their own scoped ids, such as the
  // types a cross-type package reads.
  companions: readonly PluginPackageDefinition[] = [],
  // The package's own config, as a brain gives it.
  packageConfig: unknown = {},
  // Types registered beside the package's, as the shell and class plugins
  // register them, for readers that read across types.
  registerTypes: (registry: EntityRegistry) => void = (): void => {},
): Promise<DeclaredEntityStore> {
  const temporary = await createTestDirectory();
  const logger = createSilentLogger();
  const dbConfig = { url: `file:${temporary.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const plugins = [
    ...instantiatePluginPackageDefinition(
      definition,
      packageConfig,
      { name: packageName, version: "0.0.0-test" },
      typeof pluginId === "string" ? { pluginId } : pluginId,
    ),
    ...companions.flatMap((companion) =>
      instantiatePluginPackageDefinition(
        companion,
        {},
        { name: `@fixture/${companion.id}`, version: "0.0.0-test" },
      ),
    ),
  ];
  const registry = EntityRegistry.createFresh(logger);
  registerTypes(registry);
  // A service package installs its owned types' entity plugins beside it.
  const entityPlugins = plugins.flatMap((plugin) =>
    plugin instanceof EntityPlugin ? [plugin] : [],
  );
  if (entityPlugins.length === 0) throw new Error("No entity plugin");
  for (const plugin of entityPlugins) {
    registry.registerEntityType(
      plugin.entityType,
      plugin.schema,
      plugin.adapter,
      typeof config === "function" ? config(plugin.entityType) : config,
    );
  }
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${temporary.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
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
  const shell = createMockShell({ logger, entityService: service });
  for (const plugin of plugins) await plugin.register(shell);
  // What a type validates before it is stored, as the shell's one registry
  // holds it for the entity service the plugins write through.
  for (const plugin of entityPlugins) {
    const validator = shell
      .getEntityRegistry()
      .getPersistValidator(plugin.entityType);
    if (validator)
      registry.registerPersistValidator(plugin.entityType, validator);
  }
  const db: Client = createClient(dbConfig);
  return {
    service,
    shell,
    async completeInitialSync(outcome): Promise<void> {
      await shell.getMessageBus().send({
        type: SYSTEM_CHANNELS.initialSyncCompleted,
        payload: outcome,
        sender: "directory-sync",
        broadcast: true,
      });
    },
    async settleStartupContent(): Promise<void> {
      await shell.getMessageBus().send({
        type: SYSTEM_CHANNELS.startupContentSettled,
        payload: {},
        sender: "shell",
        broadcast: true,
      });
    },
    async fetchData<T>(
      id: string,
      query: unknown,
      schema: DataSourceSchema<T>,
      context: BaseDataSourceContext,
    ): Promise<T> {
      const source = shell.getDataSourceRegistry().get(id);
      if (!source?.fetch) throw new Error(`No fetching data source ${id}`);
      return source.fetch(query, schema, context);
    },
    async stored(entityType, id): Promise<StoredRow | null> {
      const result = await db.execute({
        sql: "SELECT content, contentHash, metadata FROM entities WHERE entityType = ? AND id = ?",
        args: [entityType, id],
      });
      const row = result.rows[0];
      return row
        ? {
            content: String(row["content"]),
            contentHash: String(row["contentHash"]),
            metadata: String(row["metadata"]),
          }
        : null;
    },
    async rewrite(entityType, id, content, metadata): Promise<void> {
      await db.execute({
        sql: "UPDATE entities SET content = ?, contentHash = ?, metadata = ? WHERE entityType = ? AND id = ?",
        args: [content, computeContentHash(content), metadata, entityType, id],
      });
    },
    async setCreated(entityType, id, created): Promise<void> {
      await db.execute({
        sql: "UPDATE entities SET created = ?, updated = ? WHERE entityType = ? AND id = ?",
        args: [created, created, entityType, id],
      });
    },
    async close(): Promise<void> {
      db.close();
      service.close();
      await temporary.cleanup();
    },
  };
}
