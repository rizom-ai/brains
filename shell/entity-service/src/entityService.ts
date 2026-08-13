import {
  assetRefSchema,
  type BinaryContentReadMethod,
  type BinaryContentResolver,
} from "@brains/assets";
import { SHELL_CHANNELS } from "@brains/contracts";
import type { Client } from "@libsql/client";
import { applySqlitePragmas } from "@brains/db";
import { createEntityDatabase, ensureFtsTable, type EntityDB } from "./db";
import {
  createEmbeddingDatabase,
  migrateEmbeddingDatabase,
  ensureEmbeddingIndexes,
  attachEmbeddingDatabase,
  dbUrlToPath,
  type EmbeddingDB,
} from "./db/embedding-db";
import type {
  EntityDbConfig,
  BaseEntity,
  ContentVisibility,
  SearchResult,
  SearchOptions,
  EntityMutationResult,
  StoreEmbeddingData,
  EmbeddingBackfillResult,
  IndexReadinessOptions,
  IndexReadinessStatus,
  EntityService as IEntityService,
  EntityEventBus,
  GetEntityRequest,
  GetEntityRawRequest,
  ListEntitiesRequest,
  CountEntitiesRequest,
  DeleteEntityRequest,
  EntitySearchRequest,
  SearchWithDistancesRequest,
  ProjectSemanticSpaceRequest,
  SemanticSpaceProjection,
  CreateEntityRequest,
  CreateEntityFromMarkdownRequest,
  UpdateEntityRequest,
  UpsertEntityRequest,
  EntityTypeConfig,
  EntityMutationAdmission,
  EntityRegistry as IEntityRegistry,
} from "./types";
import { embeddings } from "./schema/embeddings";
import type { ProjectionChangedTarget } from "./schema/projection-state";
import { sql } from "drizzle-orm";
import { Logger } from "@brains/utils/logger";
import type { IEmbeddingService } from "./embedding-types";
import type { IJobQueueService } from "@brains/job-queue";
import { EmbeddingJobHandler } from "./handlers/embeddingJobHandler";
import { EntitySearch } from "./entity-search";
import { EntitySerializer } from "./entity-serializer";
import { EntityQueries } from "./entity-queries";
import { EntityMutations } from "./entity-mutations";
import { ProjectionStore } from "./projection-store";
import { ContentResolver, shouldResolveContent } from "./lib/content-resolver";
import { Cause, Effect, Exit } from "@brains/utils/effect";
import { makeIndexReadinessPollingEffect } from "./index-readiness";

/**
 * Options for creating an EntityService instance
 */
export interface EntityServiceOptions {
  embeddingService: IEmbeddingService;
  /** Disable provider-backed indexing while retaining lexical search. */
  embeddingsEnabled?: boolean | undefined;
  entityRegistry: IEntityRegistry;
  logger?: Logger;
  jobQueueService?: IJobQueueService;
  messageBus?: EntityEventBus;
  mutationAdmission?: EntityMutationAdmission;
  dbConfig: EntityDbConfig;
  /** Embedding database config. Embeddings are stored in a dedicated
   *  database file, separate from entities. */
  embeddingDbConfig: EntityDbConfig;
  /** Transitional resolver for explicitly requested data-URL materialization. */
  binaryContentResolver?: BinaryContentResolver | undefined;
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
  private db: EntityDB;
  private dbClient: Client;
  private dbUrl: string;
  private searchDbClient: Client;
  private embeddingDb: EmbeddingDB;
  private embeddingDbClient: Client;
  private dbInitPromise!: Promise<void>;
  private entityRegistry: IEntityRegistry;
  private logger: Logger;
  private jobQueueService: IJobQueueService;

  private entitySearch: EntitySearch;
  private entitySerializer: EntitySerializer;
  private entityQueries: EntityQueries;
  private entityMutations: EntityMutations;
  private readonly projectionStore: ProjectionStore;
  private contentResolver: ContentResolver;
  private binaryContentResolver: BinaryContentResolver | undefined;
  private embeddingHandlerRegistered = false;
  private indexReady = false;

  /**
   * Close the underlying database connections.
   */
  public close(): void {
    let firstError: unknown;
    let failed = false;
    try {
      if (this.embeddingHandlerRegistered) {
        this.jobQueueService.unregisterHandler(SHELL_CHANNELS.embedding);
        this.embeddingHandlerRegistered = false;
      }
    } catch (error) {
      firstError = error;
      failed = true;
    }
    try {
      this.embeddingDbClient.close();
    } catch (error) {
      if (!failed) firstError = error;
      failed = true;
    }
    try {
      this.searchDbClient.close();
    } catch (error) {
      if (!failed) firstError = error;
      failed = true;
    }
    try {
      this.dbClient.close();
    } catch (error) {
      if (!failed) firstError = error;
      failed = true;
    }
    if (failed) throw firstError;
  }

  public static createFresh(options: EntityServiceOptions): EntityService {
    return new EntityService(options);
  }

  private constructor(options: EntityServiceOptions) {
    const { db, client, url } = createEntityDatabase(options.dbConfig);
    this.db = db;
    this.dbClient = client;
    this.dbUrl = url;
    this.projectionStore = new ProjectionStore(
      this.db,
      options.mutationAdmission,
    );

    let searchDbClient: Client | undefined;
    let embeddingDbClient: Client | undefined;
    try {
      // Search has a dedicated connection because libSQL replaces a client's
      // connection after every transaction, losing connection-local ATTACHes.
      const search = createEntityDatabase(options.dbConfig);
      searchDbClient = search.client;
      this.searchDbClient = search.client;

      // Set up separate embedding database
      const emb = createEmbeddingDatabase(options.embeddingDbConfig);
      embeddingDbClient = emb.client;
      this.embeddingDb = emb.db;
      this.embeddingDbClient = emb.client;

      this.entityRegistry = options.entityRegistry;
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
      const embeddingsEnabled = options.embeddingsEnabled ?? true;
      this.entitySearch = new EntitySearch(
        search.db,
        options.embeddingService,
        this.entitySerializer,
        this.logger,
        embeddingsEnabled,
      );
      this.entityMutations = new EntityMutations({
        db: this.db,
        entityRegistry: this.entityRegistry,
        entitySerializer: this.entitySerializer,
        entityQueries: this.entityQueries,
        jobQueueService: this.jobQueueService,
        logger: this.logger,
        ...(options.messageBus && { messageBus: options.messageBus }),
        ...(options.mutationAdmission && {
          mutationAdmission: options.mutationAdmission,
        }),
        projectionStore: this.projectionStore,
        embeddingDb: this.embeddingDb,
        embeddingsEnabled,
      });
      this.contentResolver = new ContentResolver(this.logger);
      this.binaryContentResolver = options.binaryContentResolver;

      if (options.embeddingsEnabled ?? true) {
        const embeddingJobHandler = EmbeddingJobHandler.createFresh(
          this,
          options.embeddingService,
          options.messageBus,
        );
        this.jobQueueService.registerHandler(
          SHELL_CHANNELS.embedding,
          embeddingJobHandler,
        );
        this.embeddingHandlerRegistered = true;
      }

      // Initialize databases (WAL, migrations, ATTACH) — awaited by Shell.initialize()
      this.dbInitPromise = this.initializeDatabase(
        options.embeddingDbConfig,
        options.embeddingService.dimensions,
      );
      // Failures surface in initialize(); this no-op handler only prevents an
      // unhandled rejection in the window before initialize() awaits.
      this.dbInitPromise.catch(() => {});
    } catch (error) {
      try {
        if (this.embeddingHandlerRegistered) {
          options.jobQueueService?.unregisterHandler(SHELL_CHANNELS.embedding);
          this.embeddingHandlerRegistered = false;
        }
      } catch {
        // Preserve the construction failure after attempting all cleanup.
      }
      try {
        embeddingDbClient?.close();
      } catch {
        // Preserve the construction failure after attempting all cleanup.
      }
      try {
        searchDbClient?.close();
      } catch {
        // Preserve the construction failure after attempting all cleanup.
      }
      try {
        client.close();
      } catch {
        // Preserve the construction failure after attempting all cleanup.
      }
      throw error;
    }
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
    // WAL pragmas are a performance setting — failure is non-fatal
    try {
      await applySqlitePragmas(this.dbClient, this.dbUrl);
    } catch (error) {
      this.logger.warn(
        "Failed to enable WAL mode for entity database (non-fatal)",
        error,
      );
    }
    try {
      await applySqlitePragmas(this.searchDbClient, this.dbUrl);
    } catch (error) {
      this.logger.warn(
        "Failed to configure entity search database (non-fatal)",
        error,
      );
    }
    try {
      await applySqlitePragmas(this.embeddingDbClient, embeddingDbConfig.url);
    } catch (error) {
      this.logger.warn(
        "Failed to enable WAL mode for embedding database (non-fatal)",
        error,
      );
    }

    // Everything below is required for search/embedding correctness —
    // failures must propagate so Shell.initialize() fails loudly.
    await ensureFtsTable(this.dbClient);
    await migrateEmbeddingDatabase(this.embeddingDbClient, embeddingDimensions);
    await ensureEmbeddingIndexes(this.embeddingDbClient);
    await attachEmbeddingDatabase(
      this.searchDbClient,
      dbUrlToPath(embeddingDbConfig.url),
    );
  }

  // ── Projection coordination ───────────────────────────────────────

  public getProjectionStore(): ProjectionStore {
    return this.projectionStore;
  }

  public setProjectionWakeup(wakeup: () => Promise<void>): () => void {
    return this.entityMutations.setProjectionWakeup(wakeup);
  }

  // ── Mutations ─────────────────────────────────────────────────────

  public async createEntity<T extends BaseEntity>(
    request: CreateEntityRequest<T>,
  ): Promise<EntityMutationResult> {
    await this.initialize();
    return this.entityMutations.createEntity(request);
  }

  public async createEntityFromMarkdown(
    request: CreateEntityFromMarkdownRequest,
  ): Promise<EntityMutationResult> {
    await this.initialize();
    const { input, options } = request;
    const parsed = this.entitySerializer.deserializeEntity(
      input.markdown,
      input.entityType,
    );

    return this.entityMutations.createEntity({
      entity: {
        ...parsed,
        id: input.id,
        entityType: input.entityType,
        content: input.markdown,
        metadata: parsed.metadata ?? {},
        ...(input.visibility !== undefined
          ? { visibility: input.visibility }
          : {}),
      },
      ...(options !== undefined && { options }),
    });
  }

  public async updateEntity<T extends BaseEntity>(
    request: UpdateEntityRequest<T>,
  ): Promise<EntityMutationResult> {
    await this.initialize();
    return this.entityMutations.updateEntity(request);
  }

  public async deleteEntity(request: DeleteEntityRequest): Promise<boolean> {
    await this.initialize();
    return this.entityMutations.deleteEntity(request);
  }

  public async upsertEntity<T extends BaseEntity>(
    request: UpsertEntityRequest<T>,
  ): Promise<EntityMutationResult & { created: boolean }> {
    await this.initialize();
    return this.entityMutations.upsertEntity(request);
  }

  public async storeEmbedding(data: StoreEmbeddingData): Promise<void> {
    await this.initialize();
    return this.entityMutations.storeEmbedding(data);
  }

  public async reconcileProjectionTargets(
    targets: readonly ProjectionChangedTarget[],
  ): Promise<void> {
    await this.initialize();
    return this.entityMutations.reconcileProjectionTargets(targets);
  }

  public async backfillMissingEmbeddings(): Promise<EmbeddingBackfillResult> {
    await this.initialize();
    this.indexReady = false;
    return this.entityMutations.backfillMissingEmbeddings();
  }

  public isIndexReady(): boolean {
    return this.indexReady;
  }

  public async awaitIndexReady(
    options: IndexReadinessOptions,
  ): Promise<IndexReadinessStatus> {
    await this.initialize();
    let probeFailed = false;
    const probe = Effect.tryPromise({
      try: () => this.getIndexReadinessStatus(),
      catch: (error) => error,
    }).pipe(
      Effect.tapError((error) =>
        Effect.sync(() => {
          if (!probeFailed) {
            this.logger.warn(
              "Semantic index readiness check failed; retrying",
              {
                error,
              },
            );
            probeFailed = true;
          }
        }),
      ),
      Effect.tap(() =>
        Effect.sync(() => {
          probeFailed = false;
        }),
      ),
    );
    const polling = makeIndexReadinessPollingEffect(probe, {
      intervalMs: options.intervalMs ?? 250,
      ...(options.timeoutMs !== undefined && {
        timeoutMs: options.timeoutMs,
      }),
    });
    const exit = await Effect.runPromiseExit(polling, {
      ...(options.signal && { signal: options.signal }),
    });

    if (Exit.isFailure(exit)) {
      if (options.signal?.aborted) throw options.signal.reason;
      throw Cause.squash(exit.cause);
    }

    if (exit.value.ready) this.indexReady = true;
    return exit.value;
  }

  private async getIndexReadinessStatus(): Promise<IndexReadinessStatus> {
    const [activeJobs, stats] = await Promise.all([
      this.jobQueueService.getActiveJobs([SHELL_CHANNELS.embedding]),
      this.entityMutations.getEmbeddingIndexStats(),
    ]);
    const activeEmbeddingJobs = activeJobs.length;
    const completeWithoutFailures =
      activeEmbeddingJobs === 0 &&
      stats.missingEmbeddings === 0 &&
      stats.staleEmbeddings === 0;
    const degraded = completeWithoutFailures && stats.failedEmbeddings > 0;

    return {
      ready: completeWithoutFailures,
      degraded,
      activeEmbeddingJobs,
      missingEmbeddings: stats.missingEmbeddings,
      staleEmbeddings: stats.staleEmbeddings,
      failedEmbeddings: stats.failedEmbeddings,
      embeddableEntities: stats.embeddableEntities,
      embeddedEntities: stats.embeddedEntities,
    };
  }

  // ── Reads ─────────────────────────────────────────────────────────

  public async getEntity<T extends BaseEntity>(
    request: GetEntityRequest,
  ): Promise<T | null> {
    await this.initialize();
    const entity = await this.readEntity<T>(request, "getEntity");
    if (!entity) return null;

    // Reference mode is storage-oriented and must not expand embedded image
    // references in otherwise textual entities.
    if (
      request.binaryContent !== "reference" &&
      shouldResolveContent(request.entityType) &&
      entity.content
    ) {
      const result = await this.contentResolver.resolve(
        entity.content,
        this,
        request.visibilityScope,
      );
      if (result.resolvedCount > 0) {
        return { ...entity, content: result.content };
      }
    }

    return entity;
  }

  public async getEntityRaw<T extends BaseEntity>(
    request: GetEntityRawRequest,
  ): Promise<T | null> {
    await this.initialize();
    return this.readEntity<T>(request, "getEntityRaw");
  }

  public async listEntities<T extends BaseEntity>(
    request: ListEntitiesRequest,
  ): Promise<T[]> {
    await this.initialize();
    const { entityType, options } = request;
    const entities = await this.entityQueries.listEntities<T>(
      entityType,
      options,
      this.publishedStatusesFor(entityType),
    );
    return Promise.all(
      entities.map((entity) =>
        this.resolveBinaryContent(
          entity,
          request.binaryContent,
          "listEntities",
          request.binaryContentSurface,
        ),
      ),
    );
  }

  private async readEntity<T extends BaseEntity>(
    request: GetEntityRequest,
    method: Extract<BinaryContentReadMethod, "getEntity" | "getEntityRaw">,
  ): Promise<T | null> {
    const entityData = await this.entityQueries.getEntityData(
      request.entityType,
      request.id,
      request.visibilityScope,
    );
    if (!entityData) return null;

    const entity = await this.entitySerializer.convertToEntity<T>(entityData);
    if (!entity) return null;
    return this.resolveBinaryContent(
      entity,
      request.binaryContent,
      method,
      request.binaryContentSurface,
    );
  }

  private async resolveBinaryContent<T extends BaseEntity>(
    entity: T,
    mode: GetEntityRequest["binaryContent"],
    method: BinaryContentReadMethod,
    surface: string | undefined,
  ): Promise<T> {
    if (mode === "reference") return entity;
    if (
      this.entityRegistry.getEntityTypeConfig(entity.entityType)
        .binaryStorage !== "asset"
    ) {
      return entity;
    }

    const parsedRef = assetRefSchema.safeParse(entity.content.trim());
    if (!parsedRef.success) return entity;

    const mediaType = entity.metadata["mediaType"];
    if (typeof mediaType !== "string" || !mediaType.trim()) {
      throw new Error(
        `Asset-backed ${entity.entityType}:${entity.id} is missing mediaType metadata`,
      );
    }
    if (!this.binaryContentResolver) {
      throw new Error(
        "Asset-backed binary content cannot be materialized without a resolver",
      );
    }

    const content = await this.binaryContentResolver.materializeLegacyDataUrl({
      ref: parsedRef.data,
      mediaType,
      method,
      ...(surface && { surface }),
    });
    return { ...entity, content };
  }

  public async countEntities(request: CountEntitiesRequest): Promise<number> {
    await this.initialize();
    const { entityType, options } = request;
    return this.entityQueries.countEntities(
      entityType,
      options,
      this.publishedStatusesFor(entityType),
    );
  }

  /**
   * The adapter-declared publish-gate statuses for a type, if any. What
   * "published" means belongs to the entity type — queries consult this
   * instead of the shell hardcoding every plugin's lifecycle vocabulary.
   */
  private publishedStatusesFor(entityType: string): string[] | undefined {
    if (!this.entityRegistry.hasEntityType(entityType)) {
      return undefined;
    }
    return this.entityRegistry.getAdapter(entityType).publishedStatuses;
  }

  public async getEntityCounts(
    visibilityScope?: ContentVisibility,
  ): Promise<Array<{ entityType: string; count: number }>> {
    await this.initialize();
    return this.entityQueries.getEntityCounts(visibilityScope);
  }

  // ── Search ────────────────────────────────────────────────────────

  public async search<T extends BaseEntity = BaseEntity>(
    request: EntitySearchRequest,
  ): Promise<SearchResult<T>[]> {
    await this.initialize();
    return this.entitySearch.search<T>(request.query, request.options);
  }

  public async searchEntities(
    entityType: string,
    query: string,
    options?: Pick<SearchOptions, "limit">,
  ): Promise<SearchResult[]> {
    await this.initialize();
    return this.entitySearch.searchEntities(entityType, query, options);
  }

  public async searchWithDistances(
    request: SearchWithDistancesRequest,
  ): Promise<
    Array<{ entityId: string; entityType: string; distance: number }>
  > {
    await this.initialize();
    return this.entitySearch.searchWithDistances(request.query);
  }

  public async projectSemanticSpace(
    request: ProjectSemanticSpaceRequest,
  ): Promise<SemanticSpaceProjection> {
    await this.initialize();
    return this.entitySearch.projectSemanticSpace(request);
  }

  public async countEmbeddings(): Promise<number> {
    await this.initialize();
    const result = await this.embeddingDb
      .select({ count: sql<number>`count(*)` })
      .from(embeddings);
    return result[0]?.count ?? 0;
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

  public getEntityTypeConfig(type: string): EntityTypeConfig {
    return this.entityRegistry.getEntityTypeConfig(type);
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
