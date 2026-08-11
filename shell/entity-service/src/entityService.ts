import { SHELL_CHANNELS } from "@brains/contracts";
import type { Client } from "@libsql/client";
import { applySqlitePragmas } from "@brains/db";
import { createEntityDatabase, type EntityDB } from "./db";
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
import { EntityJobOutbox } from "./entity-job-outbox";
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
  private dbInitPromise!: Promise<void>;
  private entityRegistry: IEntityRegistry;
  private logger: Logger;
  private jobQueueService: IJobQueueService;

  private entitySearch: EntitySearch;
  private entitySerializer: EntitySerializer;
  private entityQueries: EntityQueries;
  private entityMutations: EntityMutations;
  private readonly projectionStore: ProjectionStore;
  private jobOutbox!: EntityJobOutbox;
  private contentResolver: ContentResolver;
  private embeddingHandlerRegistered = false;
  private indexReady = false;

  /**
   * Close the underlying database connections.
   */
  public close(): void {
    let firstError: unknown;
    let failed = false;
    this.jobOutbox.abandon();
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

    try {
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
      this.jobOutbox = new EntityJobOutbox(
        this.db,
        this.jobQueueService,
        this.projectionStore,
        this.logger,
      );

      this.entitySerializer = new EntitySerializer(
        this.entityRegistry,
        this.logger,
      );
      this.entityQueries = new EntityQueries({
        db: this.db,
        serializer: this.entitySerializer,
        logger: this.logger,
      });
      const embeddingsEnabled = options.embeddingsEnabled ?? true;
      this.entitySearch = new EntitySearch(
        this.db,
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
        jobOutbox: this.jobOutbox,
        logger: this.logger,
        ...(options.messageBus && { messageBus: options.messageBus }),
        ...(options.mutationAdmission && {
          mutationAdmission: options.mutationAdmission,
        }),
        projectionStore: this.projectionStore,
        embeddingsEnabled,
        embeddingDimensions: options.embeddingService.dimensions,
      });
      this.contentResolver = new ContentResolver(this.logger);

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

      // Initialize database settings.
      this.dbInitPromise = this.initializeDatabase();
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
        client.close();
      } catch {
        // Preserve the construction failure after attempting all cleanup.
      }
      throw error;
    }
  }

  /**
   * Wait for database initialization.
   * Called by Shell.initialize() before plugins load.
   */
  public async initialize(): Promise<void> {
    await this.dbInitPromise;
  }

  private async initializeDatabase(): Promise<void> {
    // WAL pragmas are a performance setting — failure is non-fatal
    try {
      await applySqlitePragmas(this.dbClient, this.dbUrl);
    } catch (error) {
      this.logger.warn(
        "Failed to enable WAL mode for entity database (non-fatal)",
        error,
      );
    }
    // Foreign keys provide atomic embedding cleanup when an entity is deleted.
    await this.dbClient.execute("PRAGMA foreign_keys = ON");

    try {
      const delivered = await this.jobOutbox.flush();
      if (delivered > 0) {
        this.logger.info("Recovered pending embedding job intents", {
          delivered,
        });
      }
    } catch (error) {
      this.logger.error(
        "Failed to recover pending embedding job intents; intents remain durable",
        error,
      );
    }
  }

  /** Drain durable embedding intents while the owner job database is open. */
  public flushJobOutbox(): Promise<number> {
    return this.jobOutbox.flush();
  }

  /** Number of entity-committed embedding intents not yet acknowledged. */
  public getPendingJobOutboxCount(): Promise<number> {
    return this.jobOutbox.pendingCount();
  }

  /** Wait for admitted background delivery without starting another pass. */
  public waitForJobOutboxIdle(): Promise<void> {
    return this.jobOutbox.waitForIdle();
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
    const { entityType, id, visibilityScope } = request;
    const entity = await this.getEntityRaw<T>({
      entityType,
      id,
      ...(visibilityScope !== undefined && { visibilityScope }),
    });
    if (!entity) {
      return null;
    }

    if (shouldResolveContent(entityType) && entity.content) {
      const result = await this.contentResolver.resolve(
        entity.content,
        this,
        visibilityScope,
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
    const { entityType, id, visibilityScope } = request;
    const entityData = await this.entityQueries.getEntityData(
      entityType,
      id,
      visibilityScope,
    );
    if (!entityData) {
      return null;
    }

    return this.entitySerializer.convertToEntity<T>(entityData);
  }

  public async listEntities<T extends BaseEntity>(
    request: ListEntitiesRequest,
  ): Promise<T[]> {
    await this.initialize();
    const { entityType, options } = request;
    return this.entityQueries.listEntities<T>(
      entityType,
      options,
      this.publishedStatusesFor(entityType),
    );
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
    const result = await this.db
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
