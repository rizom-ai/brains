import { AsyncLocalStorage } from "node:async_hooks";
import { SHELL_CHANNELS } from "@brains/contracts";
import type { IJobQueueService } from "@brains/job-queue";
import { Logger } from "@brains/utils/logger";
import type { IEmbeddingService } from "./embedding-types";
import { EntitySerializer } from "./entity-serializer";
import { EmbeddingJobHandler } from "./handlers/embeddingJobHandler";
import {
  ENTITY_RPC_EXPORT_PAGE_SIZE,
  ENTITY_RPC_LIST_PAGE_SIZE,
  parseEntityRpcResult,
  type EntityIndexReadinessRpcOptions,
  type EntityRpcRequest,
  type EntityRpcTransport,
} from "./entity-rpc";
import { RemoteProjectionStore } from "./remote-projection-store";
import type { ProjectionStoreRpcTransport } from "./projection-rpc";
import type {
  BulkMutationInput,
  DurableBulkMutationChildInput,
  DurableBulkMutationRootInput,
  ProjectionBatchScope,
  SettleDurableBulkMutationChildInput,
} from "./projection-store";
import type {
  AcknowledgeEntityExportsRequest,
  EntityExportIntent,
} from "./entity-export-types";
import type { ProjectionChangedTarget } from "./schema/projection-state";
import type {
  BaseEntity,
  ContentVisibility,
  CountEntitiesRequest,
  CreateEntityFromMarkdownRequest,
  CreateEntityRequest,
  DeleteEntityRequest,
  EmbeddingBackfillResult,
  EntityEventBus,
  EntityMutationResult,
  EntityRegistry,
  EntitySearchRequest,
  EntityService,
  EntityTypeConfig,
  GetEntityRawRequest,
  GetEntityRequest,
  IndexReadinessOptions,
  IndexReadinessStatus,
  ListEntitiesRequest,
  ProjectSemanticSpaceRequest,
  ProjectionOwnedEntityRequest,
  SearchResult,
  SearchWithDistancesRequest,
  SemanticSpaceProjection,
  StoreEmbeddingData,
  UpdateEntityRequest,
  UpsertEntityRequest,
} from "./types";

export interface RemoteEntityServiceOptions {
  transport: EntityRpcTransport;
  projectionTransport: ProjectionStoreRpcTransport;
  embeddingService: IEmbeddingService;
  entityRegistry: EntityRegistry;
  jobQueueService: IJobQueueService;
  logger?: Logger;
  messageBus?: EntityEventBus;
}

/** Worker facade: registries and handlers stay local; persistence stays in web. */
export class RemoteEntityService implements EntityService {
  private readonly transport: EntityRpcTransport;
  private readonly projectionTransport: ProjectionStoreRpcTransport;
  private readonly entityRegistry: EntityRegistry;
  private readonly jobQueueService: IJobQueueService;
  private readonly serializer: EntitySerializer;
  private readonly projectionStore: RemoteProjectionStore;
  private readonly batchScope = new AsyncLocalStorage<ProjectionBatchScope>();
  private initialization: Promise<void> | undefined;
  private closeRequested = false;
  private embeddingHandlerRegistered = false;
  private indexReady = false;

  public constructor(options: RemoteEntityServiceOptions) {
    this.transport = options.transport;
    this.projectionTransport = options.projectionTransport;
    this.entityRegistry = options.entityRegistry;
    this.jobQueueService = options.jobQueueService;
    const logger = (options.logger ?? Logger.getInstance()).child(
      "RemoteEntityService",
    );
    this.serializer = new EntitySerializer(this.entityRegistry, logger);
    this.projectionStore = new RemoteProjectionStore(
      this.projectionTransport,
      () => this.assertOpen(),
    );

    const embeddingHandler = EmbeddingJobHandler.createFresh(
      this,
      options.embeddingService,
      options.messageBus,
    );
    this.jobQueueService.registerHandler(
      SHELL_CHANNELS.embedding,
      embeddingHandler,
    );
    this.embeddingHandlerRegistered = true;
  }

  public initialize(): Promise<void> {
    this.assertOpen();
    this.initialization ??= Promise.all([
      this.transport.initialize(),
      this.projectionTransport.initialize(),
    ]).then(() => undefined);
    return this.initialization;
  }

  public close(): void {
    if (this.closeRequested) return;
    this.closeRequested = true;
    if (this.embeddingHandlerRegistered) {
      this.jobQueueService.unregisterHandler(SHELL_CHANNELS.embedding);
      this.embeddingHandlerRegistered = false;
    }
    this.projectionTransport.close();
    this.transport.close();
  }

  private assertOpen(): void {
    if (this.closeRequested) throw new Error("Remote entity service is closed");
  }

  private async requestRemote<T>(
    request: EntityRpcRequest,
    options?: { signal?: AbortSignal | undefined },
  ): Promise<T> {
    this.assertOpen();
    // The owner re-enters this scope before dispatch so writes made inside a
    // worker-run bulk mutation are still fenced against its batch.
    const batchScope = this.batchScope.getStore();
    const result = await this.transport.request(
      { request, ...(batchScope !== undefined && { batchScope }) },
      options,
    );
    return parseEntityRpcResult(request, result) as T;
  }

  public getProjectionStore(): RemoteProjectionStore {
    return this.projectionStore;
  }

  public setProjectionWakeup(_wakeup: () => Promise<void>): () => void {
    // Executor activation never installs a scheduler wakeup in the worker.
    return (): void => undefined;
  }

  public createEntity<T extends BaseEntity>(
    request: CreateEntityRequest<T>,
  ): Promise<EntityMutationResult> {
    return this.requestRemote<EntityMutationResult>({
      operation: "createEntity",
      request: request as CreateEntityRequest<BaseEntity>,
    });
  }

  public createEntityFromMarkdown(
    request: CreateEntityFromMarkdownRequest,
  ): Promise<EntityMutationResult> {
    return this.requestRemote<EntityMutationResult>({
      operation: "createEntityFromMarkdown",
      request,
    });
  }

  public updateEntity<T extends BaseEntity>(
    request: UpdateEntityRequest<T>,
  ): Promise<EntityMutationResult> {
    return this.requestRemote<EntityMutationResult>({
      operation: "updateEntity",
      request: request as UpdateEntityRequest<BaseEntity>,
    });
  }

  public deleteEntity(request: DeleteEntityRequest): Promise<boolean> {
    return this.requestRemote<boolean>({ operation: "deleteEntity", request });
  }

  public upsertEntity<T extends BaseEntity>(
    request: UpsertEntityRequest<T>,
  ): Promise<EntityMutationResult & { created: boolean }> {
    return this.requestRemote<EntityMutationResult & { created: boolean }>({
      operation: "upsertEntity",
      request: request as UpsertEntityRequest<BaseEntity>,
    });
  }

  public storeEmbedding(data: StoreEmbeddingData): Promise<void> {
    return this.requestRemote<void>({ operation: "storeEmbedding", data });
  }

  public reconcileProjectionTargets(
    targets: readonly ProjectionChangedTarget[],
  ): Promise<void> {
    return this.requestRemote<void>({
      operation: "reconcileProjectionTargets",
      targets,
    });
  }

  public backfillMissingEmbeddings(): Promise<EmbeddingBackfillResult> {
    this.indexReady = false;
    return this.requestRemote<EmbeddingBackfillResult>({
      operation: "backfillMissingEmbeddings",
    });
  }

  public isIndexReady(): boolean {
    return this.indexReady;
  }

  public async awaitIndexReady(
    options: IndexReadinessOptions,
  ): Promise<IndexReadinessStatus> {
    const rpcOptions: EntityIndexReadinessRpcOptions = {
      ...(options.timeoutMs !== undefined && { timeoutMs: options.timeoutMs }),
      ...(options.intervalMs !== undefined && {
        intervalMs: options.intervalMs,
      }),
    };
    const status = await this.requestRemote<IndexReadinessStatus>(
      { operation: "awaitIndexReady", options: rpcOptions },
      options.signal ? { signal: options.signal } : undefined,
    );
    if (status.ready) this.indexReady = true;
    return status;
  }

  public getEntity<T extends BaseEntity>(
    request: GetEntityRequest,
  ): Promise<T | null> {
    return this.requestRemote<T | null>({ operation: "getEntity", request });
  }

  public getEntityRaw<T extends BaseEntity>(
    request: GetEntityRawRequest,
  ): Promise<T | null> {
    return this.requestRemote<T | null>({ operation: "getEntityRaw", request });
  }

  public async listEntities<T extends BaseEntity>(
    request: ListEntitiesRequest,
  ): Promise<T[]> {
    const requestedLimit = request.options?.limit;
    let remaining = requestedLimit ?? Number.POSITIVE_INFINITY;
    let offset = request.options?.offset ?? 0;
    const configuredSort = request.options?.sortFields ?? [
      { field: "updated", direction: "desc" as const },
    ];
    const sortFields = [...configuredSort];
    for (const field of ["entityType", "id"]) {
      if (!sortFields.some((sort) => sort.field === field)) {
        sortFields.push({ field, direction: "asc" });
      }
    }
    const entities: T[] = [];

    while (remaining > 0) {
      const limit = Math.min(remaining, ENTITY_RPC_LIST_PAGE_SIZE);
      const page = await this.requestRemote<T[]>({
        operation: "listEntities",
        request: {
          entityType: request.entityType,
          options: {
            ...request.options,
            limit,
            offset,
            sortFields,
          },
        },
      });
      entities.push(...page);
      if (page.length < limit) break;
      remaining -= page.length;
      offset += page.length;
    }

    return entities;
  }

  public countEntities(request: CountEntitiesRequest): Promise<number> {
    return this.requestRemote<number>({ operation: "countEntities", request });
  }

  public getEntityCounts(
    visibilityScope?: ContentVisibility,
  ): Promise<Array<{ entityType: string; count: number }>> {
    return this.requestRemote<Array<{ entityType: string; count: number }>>({
      operation: "getEntityCounts",
      ...(visibilityScope !== undefined && { visibilityScope }),
    });
  }

  public search<T extends BaseEntity = BaseEntity>(
    request: EntitySearchRequest,
  ): Promise<SearchResult<T>[]> {
    return this.requestRemote<SearchResult<T>[]>({
      operation: "search",
      request,
    });
  }

  public searchWithDistances(
    request: SearchWithDistancesRequest,
  ): Promise<
    Array<{ entityId: string; entityType: string; distance: number }>
  > {
    return this.requestRemote({ operation: "searchWithDistances", request });
  }

  public projectSemanticSpace(
    request: ProjectSemanticSpaceRequest,
  ): Promise<SemanticSpaceProjection> {
    return this.requestRemote<SemanticSpaceProjection>({
      operation: "projectSemanticSpace",
      request,
    });
  }

  public countEmbeddings(): Promise<number> {
    return this.requestRemote<number>({ operation: "countEmbeddings" });
  }

  public serializeEntity(entity: BaseEntity): string {
    return this.serializer.serializeEntity(entity);
  }

  public deserializeEntity(
    markdown: string,
    entityType: string,
  ): Partial<BaseEntity> {
    return this.serializer.deserializeEntity(markdown, entityType);
  }

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

  public getAsyncJobStatus(jobId: string): Promise<{
    status: "pending" | "processing" | "completed" | "failed";
    error?: string;
  } | null> {
    return this.requestRemote({ operation: "getAsyncJobStatus", jobId });
  }

  public async listPendingEntityExports(): Promise<EntityExportIntent[]> {
    const intents: EntityExportIntent[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const page = await this.requestRemote<EntityExportIntent[]>({
        operation: "listPendingEntityExports",
        offset,
        limit: ENTITY_RPC_EXPORT_PAGE_SIZE,
      });
      intents.push(...page);
      hasMore = page.length === ENTITY_RPC_EXPORT_PAGE_SIZE;
      offset += page.length;
    }
    return intents;
  }

  public hasPendingEntityExports(): Promise<boolean> {
    return this.requestRemote<boolean>({
      operation: "hasPendingEntityExports",
    });
  }

  public acknowledgeEntityExports(
    request: AcknowledgeEntityExportsRequest,
  ): Promise<number> {
    return this.requestRemote<number>({
      operation: "acknowledgeEntityExports",
      request: {
        intents: request.intents.map(({ entityType, entityId, revision }) => ({
          entityType,
          entityId,
          revision,
        })),
      },
    });
  }

  public isProjectionOwnedEntity(
    request: ProjectionOwnedEntityRequest,
  ): Promise<boolean> {
    return this.requestRemote<boolean>({
      operation: "isProjectionOwnedEntity",
      request,
    });
  }

  // ── Bulk mutation ──────────────────────────────────────────────────────
  // The mutation body runs here; only its durable bracketing crosses to the
  // owner. The scope travels with every entity request this process makes
  // (see `requestRemote`), so owner-side writes are fenced against the batch
  // exactly as they would be in-process.

  public async runBulkMutation<TResult>(
    input: BulkMutationInput,
    mutation: () => Promise<TResult>,
  ): Promise<TResult> {
    await this.initialize();
    if (this.batchScope.getStore()) return mutation();

    const scope = await this.projectionStore.openCallbackBatch(input);
    const heartbeat = setInterval(() => {
      void this.projectionStore.renewCallbackBatch(scope).catch(() => {
        // Mutation transactions enforce the fence if renewal loses ownership.
      });
    }, 10_000);
    heartbeat.unref();
    try {
      return await this.batchScope.run(scope, mutation);
    } finally {
      clearInterval(heartbeat);
      await this.projectionStore.closeCallbackBatch(scope);
    }
  }

  public async prepareDurableBulkMutation(
    input: DurableBulkMutationRootInput,
  ): Promise<void> {
    await this.requestRemote({
      operation: "prepareDurableBulkMutation",
      input,
    });
  }

  public async finalizeDurableBulkMutationEnqueue(
    operationId: string,
  ): Promise<void> {
    await this.requestRemote({
      operation: "finalizeDurableBulkMutationEnqueue",
      operationId,
    });
  }

  public async failDurableBulkMutationEnqueue(
    operationId: string,
  ): Promise<void> {
    await this.requestRemote({
      operation: "failDurableBulkMutationEnqueue",
      operationId,
    });
  }

  public async runDurableBulkMutationChild<TResult>(
    input: DurableBulkMutationChildInput,
    mutation: () => Promise<TResult>,
  ): Promise<TResult> {
    await this.initialize();
    if (this.batchScope.getStore()) return mutation();

    const scope = await this.projectionStore.openDurableBatchChild(input);
    return this.batchScope.run(scope, mutation);
  }

  public settleDurableBulkMutationChild(
    input: SettleDurableBulkMutationChildInput,
  ): Promise<boolean> {
    return this.requestRemote({
      operation: "settleDurableBulkMutationChild",
      input,
    });
  }

  /**
   * Startup recovery reads batch roots through a process-local reader, which
   * cannot cross the endpoint. Only the owner runs recovery, so reaching this
   * from a worker is a wiring mistake rather than a supported call.
   */
  public recoverProjectionBatches(): Promise<never> {
    return Promise.reject(
      new Error("recoverProjectionBatches runs only in the scheduler owner"),
    );
  }
}
