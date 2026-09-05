import type { AssetRef, AssetStat, AssetVerification } from "@brains/assets";
import { SHELL_CHANNELS } from "@brains/contracts";
import type { Client } from "@libsql/client";
import { applySqlitePragmas, closeSqliteClient } from "@brains/db";
import { createEntityDatabase, normalizeSearchText, type EntityDB } from "./db";
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
  ProjectionOwnedEntityRequest,
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
  BulkMutationInput,
  DurableBulkMutationChildInput,
  DurableBulkMutationRootInput,
  ProjectionBatchRecoveryResult,
  ProjectionBatchRootReader,
  SettleDurableBulkMutationChildInput,
  EntityExportIntent,
  AcknowledgeEntityExportsRequest,
  EntityRegistry as IEntityRegistry,
  EntitySchema,
} from "./types";
import { embeddings } from "./schema/embeddings";
import { entities } from "./schema/entities";
import type { ProjectionChangedTarget } from "./schema/projection-state";
import { and, asc, gte, isNull, sql } from "drizzle-orm";
import { ConsoleLogger, type Logger } from "@brains/utils/logger";
import type { IEmbeddingService } from "./embedding-types";
import type { IJobQueueService } from "@brains/job-queue";
import { EmbeddingJobHandler } from "./handlers/embeddingJobHandler";
import { EntitySearch } from "./entity-search";
import { EntitySerializer } from "./entity-serializer";
import { EntityQueries } from "./entity-queries";
import { EntityMutations } from "./entity-mutations";
import { EntityJobOutbox } from "./entity-job-outbox";
import { ProjectionStore } from "./projection-store";
import { EntityExportStore } from "./entity-export-store";
import { SqliteAssetRepository } from "./sqlite-asset-repository";
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
  /** Clock used for durable projection-ingress timestamps. */
  projectionNow?: (() => number) | undefined;
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

/**
 * Rows rewritten per committed page when backfilling `search_text`. Bounds
 * both the entity content held in memory and the work an interrupted boot
 * has to repeat.
 */
export const SEARCH_TEXT_BACKFILL_PAGE_SIZE = 200;

export class EntityService implements IEntityService {
  private db: EntityDB;
  private dbClient: Client;
  private dbUrl: string;
  // Assigned inside the constructor's try block: null until that succeeds, so
  // initialize() reports the failure instead of awaiting undefined.
  private dbInitPromise: Promise<void> | null = null;
  private entityRegistry: IEntityRegistry;
  private logger: Logger;
  private jobQueueService: IJobQueueService;

  private entitySearch: EntitySearch;
  private entitySerializer: EntitySerializer;
  private entityQueries: EntityQueries;
  private entityMutations: EntityMutations;
  private readonly projectionStore: ProjectionStore;
  private jobOutbox!: EntityJobOutbox;
  private readonly assetRepository: SqliteAssetRepository;
  private readonly entityExportStore: EntityExportStore;
  private contentResolver: ContentResolver;
  private embeddingHandlerRegistered = false;
  private indexReady = false;
  private closePromise: Promise<void> | null = null;

  /** Begin closing without changing the existing synchronous service contract. */
  public close(): void {
    void this.closeAsync().catch((error) => {
      this.logger.error("Failed to close entity storage", error);
    });
  }

  /** Await handler release and the database handle's durable close. */
  public closeAsync(): Promise<void> {
    this.closePromise ??= this.closeOwnedResources();
    return this.closePromise;
  }

  private async closeOwnedResources(): Promise<void> {
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
      await closeSqliteClient(this.dbClient);
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
    this.assetRepository = new SqliteAssetRepository(this.db);
    this.entityExportStore = new EntityExportStore(
      this.db,
      options.projectionNow ?? Date.now,
    );
    this.projectionStore = new ProjectionStore(
      this.db,
      options.mutationAdmission,
      options.projectionNow ?? Date.now,
      {
        assetRepository: this.assetRepository,
        isAssetBacked: (entityType): boolean =>
          options.entityRegistry.getEntityTypeConfig(entityType)
            .binaryStorage === "asset",
        isFullTextSearchable: (entityType): boolean =>
          options.entityRegistry.getEntityTypeConfig(entityType)
            .fullTextSearchable !== false,
      },
    );

    try {
      this.entityRegistry = options.entityRegistry;
      this.logger = (options.logger ?? ConsoleLogger.getInstance()).child(
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
        () =>
          this.entityRegistry
            .getAllEntityTypes()
            .filter(
              (type) =>
                this.entityRegistry.getEntityTypeConfig(type)
                  .fullTextSearchable === false,
            ),
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
        assetRepository: this.assetRepository,
        entityExportStore: this.entityExportStore,
        projectionNow: options.projectionNow ?? Date.now,
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
    if (!this.dbInitPromise) {
      throw new Error(
        "Entity service database initialization never started; construction failed",
      );
    }
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
    await this.backfillSearchText();

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

  /**
   * Fill `search_text` for rows migrated before it existed.
   *
   * This runs inside initialize(), so it is on every instance's boot path
   * after the search_text migration: it pages rather than reading the whole
   * corpus, and commits each page. A boot interrupted midway resumes from the
   * rows still missing the column instead of starting over.
   */
  private async backfillSearchText(): Promise<void> {
    const pageAtATime = async (after?: {
      id: string;
      entityType: string;
    }): Promise<void> => {
      const rows = await this.db
        .select({
          id: entities.id,
          entityType: entities.entityType,
          content: entities.content,
        })
        .from(entities)
        .where(
          and(
            isNull(entities.searchText),
            // Turso needs the leading scalar bound to seek the primary key;
            // the tuple alone is evaluated as a scan filter by this engine.
            after ? gte(entities.id, after.id) : undefined,
            after
              ? sql`(${entities.id}, ${entities.entityType}) > (${after.id}, ${after.entityType})`
              : undefined,
          ),
        )
        .orderBy(asc(entities.id), asc(entities.entityType))
        .limit(SEARCH_TEXT_BACKFILL_PAGE_SIZE);
      if (rows.length === 0) return;

      await this.db.transaction(async (transaction) => {
        for (const row of rows) {
          await transaction
            .update(entities)
            .set({ searchText: normalizeSearchText(row.content) })
            .where(
              sql`${entities.id} = ${row.id} AND ${entities.entityType} = ${row.entityType}`,
            );
        }
      });

      // Seek on the composite primary key instead of rescanning completed rows.
      const last = rows.at(-1);
      if (rows.length === SEARCH_TEXT_BACKFILL_PAGE_SIZE && last) {
        await pageAtATime({ id: last.id, entityType: last.entityType });
      }
    };

    await pageAtATime();
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

  public async isProjectionOwnedEntity(
    request: ProjectionOwnedEntityRequest,
  ): Promise<boolean> {
    await this.initialize();
    return this.projectionStore.isProjectionOwnedEntity(request);
  }

  public setProjectionWakeup(wakeup: () => Promise<void>): () => void {
    return this.entityMutations.setProjectionWakeup(wakeup);
  }

  public async listPendingEntityExports(): Promise<EntityExportIntent[]> {
    await this.initialize();
    return this.entityExportStore.list();
  }

  public async hasPendingEntityExports(): Promise<boolean> {
    await this.initialize();
    return this.entityExportStore.hasPending();
  }

  public async acknowledgeEntityExports(
    request: AcknowledgeEntityExportsRequest,
  ): Promise<number> {
    await this.initialize();
    return this.entityExportStore.acknowledge(request.intents);
  }

  public async runBulkMutation<TResult>(
    input: BulkMutationInput,
    mutation: () => Promise<TResult>,
  ): Promise<TResult> {
    await this.initialize();
    try {
      return await this.projectionStore.runBulkMutation(input, mutation);
    } finally {
      await this.entityMutations.wakeProjectionScheduler();
    }
  }

  public async prepareDurableBulkMutation(
    input: DurableBulkMutationRootInput,
  ): Promise<void> {
    await this.initialize();
    await this.projectionStore.prepareDurableBulkMutation(input);
  }

  public async finalizeDurableBulkMutationEnqueue(
    operationId: string,
  ): Promise<void> {
    await this.initialize();
    await this.projectionStore.finalizeDurableBulkMutationEnqueue(operationId);
  }

  public async failDurableBulkMutationEnqueue(
    operationId: string,
  ): Promise<void> {
    await this.initialize();
    await this.projectionStore.failDurableBulkMutationEnqueue(operationId);
  }

  public async runDurableBulkMutationChild<TResult>(
    input: DurableBulkMutationChildInput,
    mutation: () => Promise<TResult>,
  ): Promise<TResult> {
    await this.initialize();
    return this.projectionStore.runDurableBulkMutationChild(input, mutation);
  }

  public async settleDurableBulkMutationChild(
    input: SettleDurableBulkMutationChildInput,
  ): Promise<boolean> {
    await this.initialize();
    const closed =
      await this.projectionStore.settleDurableBulkMutationChild(input);
    if (closed) await this.entityMutations.wakeProjectionScheduler();
    return closed;
  }

  public async recoverProjectionBatches(
    readRoot: ProjectionBatchRootReader,
  ): Promise<ProjectionBatchRecoveryResult> {
    await this.initialize();
    const result =
      await this.projectionStore.recoverProjectionBatches(readRoot);
    if (result.fencedCallbacks + result.releasedDurableRoots > 0) {
      await this.entityMutations.wakeProjectionScheduler();
    }
    return result;
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

  public async readAsset(ref: AssetRef): Promise<Uint8Array> {
    await this.initialize();
    return this.assetRepository.read(ref);
  }

  public async statAsset(ref: AssetRef): Promise<AssetStat | null> {
    await this.initialize();
    return this.assetRepository.stat(ref);
  }

  public async verifyAsset(ref: AssetRef): Promise<AssetVerification> {
    await this.initialize();
    return this.assetRepository.verify(ref);
  }

  public async getEntity(request: GetEntityRequest): Promise<BaseEntity | null>;
  public async getEntity<T extends BaseEntity>(
    request: GetEntityRequest,
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  public async getEntity(
    request: GetEntityRequest,
    schema?: EntitySchema<BaseEntity>,
  ): Promise<BaseEntity | null> {
    await this.initialize();
    const { entityType, id, visibilityScope } = request;
    const entity = await this.getEntityRaw({
      entityType,
      id,
      visibilityScope,
    });
    if (!entity) {
      return null;
    }

    const resolved = await this.resolveEntityContent(
      entityType,
      entity,
      visibilityScope,
    );
    return schema ? schema.parse(resolved) : resolved;
  }

  private async resolveEntityContent(
    entityType: string,
    entity: BaseEntity,
    visibilityScope: ContentVisibility | undefined,
  ): Promise<BaseEntity> {
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

  public async getEntityRaw(
    request: GetEntityRawRequest,
  ): Promise<BaseEntity | null>;
  public async getEntityRaw<T extends BaseEntity>(
    request: GetEntityRawRequest,
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  public async getEntityRaw(
    request: GetEntityRawRequest,
    schema?: EntitySchema<BaseEntity>,
  ): Promise<BaseEntity | null> {
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

    const entity = await this.entitySerializer.convertToEntity(entityData);
    return entity && schema ? schema.parse(entity) : entity;
  }

  public async listEntities(
    request: ListEntitiesRequest,
  ): Promise<BaseEntity[]>;
  public async listEntities<T extends BaseEntity>(
    request: ListEntitiesRequest,
    schema: EntitySchema<T>,
  ): Promise<T[]>;
  public async listEntities(
    request: ListEntitiesRequest,
    schema?: EntitySchema<BaseEntity>,
  ): Promise<BaseEntity[]> {
    await this.initialize();
    const { entityType, options } = request;
    const entities = await this.entityQueries.listEntities(
      entityType,
      options,
      this.publishedStatusesFor(entityType),
    );
    return schema ? entities.map((entity) => schema.parse(entity)) : entities;
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

  public async search(
    request: EntitySearchRequest,
  ): Promise<SearchResult<BaseEntity>[]>;
  public async search<T extends BaseEntity>(
    request: EntitySearchRequest,
    schema: EntitySchema<T>,
  ): Promise<SearchResult<T>[]>;
  public async search(
    request: EntitySearchRequest,
    schema?: EntitySchema<BaseEntity>,
  ): Promise<SearchResult<BaseEntity>[]> {
    await this.initialize();
    const results = await this.entitySearch.search(
      request.query,
      request.options,
    );
    return schema
      ? results.map((result) => ({
          ...result,
          entity: schema.parse(result.entity),
        }))
      : results;
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
