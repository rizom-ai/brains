import type { Client } from "@libsql/client";
import {
  createEntityDatabase,
  enableWALModeForEntities,
  type EntityDB,
} from "./db";
import {
  createEmbeddingDatabase,
  enableWALModeForEmbeddings,
  migrateEmbeddingDatabase,
  ensureEmbeddingIndexes,
  attachEmbeddingDatabase,
  dbUrlToPath,
  type EmbeddingDB,
} from "./db/embedding-db";
import type {
  EntityDbConfig,
  BaseEntity,
  SearchResult,
  EntityInput,
  SearchOptions,
  ListOptions,
  CreateEntityOptions,
  EntityJobOptions,
  EntityMutationResult,
  StoreEmbeddingData,
  EntityService as IEntityService,
} from "./types";
import { EntityRegistry } from "./entityRegistry";
import { Logger } from "@brains/utils";
import type { IEmbeddingService } from "./embedding-types";
import type { IJobQueueService } from "@brains/job-queue";
import type { MessageBus } from "@brains/messaging-service";
import { EmbeddingJobHandler } from "./handlers/embeddingJobHandler";
import { EntitySearch } from "./entity-search";
import { EntitySerializer } from "./entity-serializer";
import { EntityQueries } from "./entity-queries";
import { EntityMutations } from "./entity-mutations";
import { ContentResolver, shouldResolveContent } from "./lib/content-resolver";

/**
 * Options for creating an EntityService instance
 */
export interface EntityServiceOptions {
  embeddingService: IEmbeddingService;
  entityRegistry?: EntityRegistry;
  logger?: Logger;
  jobQueueService?: IJobQueueService;
  messageBus?: MessageBus;
  dbConfig: EntityDbConfig;
  /** Embedding database config. Embeddings are stored in a dedicated
   *  database file, separate from entities. */
  embeddingDbConfig: EntityDbConfig;
}

/**
 * EntityService coordinates entity operations by delegating to:
 * - EntityQueries: database read operations
 * - EntityMutations: database write operations
 * - EntitySearch: vector similarity search
 * - EntitySerializer: markdown serialization
 * - ContentResolver: entity reference resolution
 */
export class EntityService implements IEntityService {
  private static instance: EntityService | null = null;

  private db: EntityDB;
  private dbClient: Client;
  private dbUrl: string;
  private embeddingDb: EmbeddingDB;
  private embeddingDbClient: Client;
  private dbInitPromise!: Promise<void>;
  private entityRegistry: EntityRegistry;
  private logger: Logger;
  private jobQueueService: IJobQueueService;

  private entitySearch: EntitySearch;
  private entitySerializer: EntitySerializer;
  private entityQueries: EntityQueries;
  private entityMutations: EntityMutations;
  private contentResolver: ContentResolver;

  public static getInstance(options: EntityServiceOptions): EntityService {
    EntityService.instance ??= new EntityService(options);
    return EntityService.instance;
  }

  public static resetInstance(): void {
    if (EntityService.instance) {
      EntityService.instance.close();
      EntityService.instance = null;
    }
  }

  /**
   * Close the underlying database connections.
   */
  public close(): void {
    this.embeddingDbClient.close();
    this.dbClient.close();
  }

  public static createFresh(options: EntityServiceOptions): EntityService {
    return new EntityService(options);
  }

  private constructor(options: EntityServiceOptions) {
    const { db, client, url } = createEntityDatabase(options.dbConfig);
    this.db = db;
    this.dbClient = client;
    this.dbUrl = url;

    // Set up separate embedding database
    const emb = createEmbeddingDatabase(options.embeddingDbConfig);
    this.embeddingDb = emb.db;
    this.embeddingDbClient = emb.client;

    this.entityRegistry =
      options.entityRegistry ??
      EntityRegistry.getInstance(Logger.getInstance());
    this.logger = (options.logger ?? Logger.getInstance()).child(
      "EntityService",
    );
    if (!options.jobQueueService) {
      throw new Error(
        "JobQueueService is required for EntityService initialization",
      );
    }
    this.jobQueueService = options.jobQueueService;

    this.entitySerializer = new EntitySerializer(
      this.entityRegistry,
      this.logger,
    );
    this.entityQueries = new EntityQueries({
      db: this.db,
      serializer: this.entitySerializer,
      logger: this.logger,
      embeddingDb: this.embeddingDb,
    });
    this.entitySearch = new EntitySearch(
      this.db,
      options.embeddingService,
      this.entitySerializer,
      this.logger,
    );
    this.entityMutations = new EntityMutations({
      db: this.db,
      entityRegistry: this.entityRegistry,
      entitySerializer: this.entitySerializer,
      entityQueries: this.entityQueries,
      jobQueueService: this.jobQueueService,
      logger: this.logger,
      ...(options.messageBus && { messageBus: options.messageBus }),
      embeddingDb: this.embeddingDb,
    });
    this.contentResolver = new ContentResolver(this.logger);

    const embeddingJobHandler = EmbeddingJobHandler.createFresh(
      this,
      options.embeddingService,
      options.messageBus,
    );
    this.jobQueueService.registerHandler(
      "shell:embedding",
      embeddingJobHandler,
    );

    // Initialize databases (WAL, migrations, ATTACH) — awaited by Shell.initialize()
    this.dbInitPromise = this.initializeDatabase(
      options.embeddingDbConfig,
      options.embeddingService.dimensions,
    ).catch((error) => {
      this.logger.warn(
        "Failed to initialize database settings (non-fatal)",
        error,
      );
    });
  }

  /**
   * Wait for database initialization (WAL mode, migrations, indexes, ATTACH).
   * Called by Shell.initialize() before plugins load.
   */
  public async initialize(): Promise<void> {
    await this.dbInitPromise;
  }

  private async initializeDatabase(
    embeddingDbConfig: EntityDbConfig,
    embeddingDimensions: number,
  ): Promise<void> {
    await enableWALModeForEntities(this.dbClient, this.dbUrl);
    await enableWALModeForEmbeddings(
      this.embeddingDbClient,
      embeddingDbConfig.url,
    );
    await migrateEmbeddingDatabase(this.embeddingDbClient, embeddingDimensions);
    await ensureEmbeddingIndexes(this.embeddingDbClient);
    await attachEmbeddingDatabase(
      this.dbClient,
      dbUrlToPath(embeddingDbConfig.url),
    );
  }

  // ── Mutations ─────────────────────────────────────────────────────

  public async createEntity<T extends BaseEntity>(
    entity: EntityInput<T>,
    options?: CreateEntityOptions,
  ): Promise<EntityMutationResult> {
    return this.entityMutations.createEntity(entity, options);
  }

  public async updateEntity<T extends BaseEntity>(
    entity: T,
    options?: EntityJobOptions,
  ): Promise<EntityMutationResult> {
    return this.entityMutations.updateEntity(entity, options);
  }

  public async deleteEntity(entityType: string, id: string): Promise<boolean> {
    return this.entityMutations.deleteEntity(entityType, id);
  }

  public async upsertEntity<T extends BaseEntity>(
    entity: T,
    options?: EntityJobOptions,
  ): Promise<EntityMutationResult & { created: boolean }> {
    return this.entityMutations.upsertEntity(entity, options);
  }

  public async storeEmbedding(data: StoreEmbeddingData): Promise<void> {
    return this.entityMutations.storeEmbedding(data);
  }

  // ── Reads ─────────────────────────────────────────────────────────

  public async getEntity<T extends BaseEntity>(
    entityType: string,
    id: string,
  ): Promise<T | null> {
    const entity = await this.getEntityRaw<T>(entityType, id);
    if (!entity) {
      return null;
    }

    if (shouldResolveContent(entityType) && entity.content) {
      const result = await this.contentResolver.resolve(entity.content, this);
      if (result.resolvedCount > 0) {
        return { ...entity, content: result.content };
      }
    }

    return entity;
  }

  public async getEntityRaw<T extends BaseEntity>(
    entityType: string,
    id: string,
  ): Promise<T | null> {
    const entityData = await this.entityQueries.getEntityData(entityType, id);
    if (!entityData) {
      return null;
    }

    return this.entitySerializer.convertToEntity<T>(entityData);
  }

  public async listEntities<T extends BaseEntity>(
    entityType: string,
    options?: ListOptions,
  ): Promise<T[]> {
    return this.entityQueries.listEntities<T>(entityType, options);
  }

  public async countEntities(
    entityType: string,
    options?: Pick<ListOptions, "publishedOnly" | "filter">,
  ): Promise<number> {
    return this.entityQueries.countEntities(entityType, options);
  }

  public async getEntityCounts(): Promise<
    Array<{ entityType: string; count: number }>
  > {
    return this.entityQueries.getEntityCounts();
  }

  // ── Search ────────────────────────────────────────────────────────

  public async search<T extends BaseEntity = BaseEntity>(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult<T>[]> {
    return this.entitySearch.search<T>(query, options);
  }

  public async searchEntities(
    entityType: string,
    query: string,
    options?: Pick<SearchOptions, "limit">,
  ): Promise<SearchResult[]> {
    return this.entitySearch.searchEntities(entityType, query, options);
  }

  // ── Serialization ─────────────────────────────────────────────────

  public serializeEntity(entity: BaseEntity): string {
    return this.entitySerializer.serializeEntity(entity);
  }

  public deserializeEntity(
    markdown: string,
    entityType: string,
  ): Partial<BaseEntity> {
    return this.entitySerializer.deserializeEntity(markdown, entityType);
  }

  // ── Registry ──────────────────────────────────────────────────────

  public getEntityTypes(): string[] {
    return this.entityRegistry.getAllEntityTypes();
  }

  public hasEntityType(type: string): boolean {
    return this.entityRegistry.hasEntityType(type);
  }

  public getWeightMap(): Record<string, number> {
    return this.entityRegistry.getWeightMap();
  }

  // ── Job status ────────────────────────────────────────────────────

  public async getAsyncJobStatus(jobId: string): Promise<{
    status: "pending" | "processing" | "completed" | "failed";
    error?: string;
  } | null> {
    const status = await this.jobQueueService.getStatus(jobId);

    if (!status) {
      return null;
    }

    return {
      status: status.status,
      ...(status.lastError && { error: status.lastError }),
    };
  }
}
