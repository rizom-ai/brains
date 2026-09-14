import { AsyncLocalStorage } from "node:async_hooks";
import type { EntityFileAssets } from "./entity-file-runtime";
import { randomUUID } from "node:crypto";
import { SHELL_CHANNELS } from "@brains/contracts";
import {
  MAX_ASSET_BYTES,
  assertPreparedAsset,
  computeAssetDigest,
  getAssetDigest,
  type AssetRef,
  type AssetStat,
  type AssetVerification,
} from "@brains/assets";
import {
  ASSET_RPC_CHUNK_BYTES,
  assetChunkRangeSchema,
} from "./asset-transfers";
import type { IJobQueueService } from "@brains/job-queue";
import { ConsoleLogger, type Logger } from "@brains/utils/logger";
import type { IEmbeddingService } from "./embedding-types";
import { EntitySerializer } from "./entity-serializer";
import {
  EntityBinaryClient,
  type EntityBinaryClientTransport,
} from "./entity-binary-client";
import { EmbeddingJobHandler } from "./handlers/embeddingJobHandler";
import {
  ENTITY_RPC_EXPORT_PAGE_SIZE,
  ENTITY_RPC_LIST_PAGE_SIZE,
  parseEntityRpcResult,
  type EntityIndexReadinessRpcOptions,
  type EntityRpcRequest,
  type EntityRpcResults,
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
  EntitySchema,
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
  binaryTransport: EntityBinaryClientTransport;
  embeddingService: IEmbeddingService;
  entityRegistry: EntityRegistry;
  jobQueueService: IJobQueueService;
  logger?: Logger;
  messageBus?: EntityEventBus;
}

/** Worker facade: registries and handlers stay local; persistence stays in web. */
export class RemoteEntityService implements EntityService {
  public fileAssets?: EntityFileAssets;
  public readonly assetTransfers: EntityBinaryClient;
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
  private transferBytes = 0;

  public constructor(options: RemoteEntityServiceOptions) {
    this.assetTransfers = new EntityBinaryClient({
      transport: options.binaryTransport,
      assertLive: (): void => this.assertOpen(),
      getBatchScope: (): ProjectionBatchScope | undefined =>
        this.batchScope.getStore(),
    });
    this.transport = options.transport;
    this.projectionTransport = options.projectionTransport;
    this.entityRegistry = options.entityRegistry;
    this.jobQueueService = options.jobQueueService;
    const logger = (options.logger ?? ConsoleLogger.getInstance()).child(
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

  private async requestRemote<TRequest extends EntityRpcRequest>(
    request: TRequest,
    options?: { signal?: AbortSignal | undefined },
  ): Promise<EntityRpcResults[TRequest["operation"]]> {
    this.assertOpen();
    // The owner re-enters this scope before dispatch so writes made inside a
    // worker-run bulk mutation are still fenced against its batch.
    const batchScope = this.batchScope.getStore();
    const result = await this.transport.request(
      { request, ...(batchScope !== undefined && { batchScope }) },
      options,
    );
    return parseEntityRpcResult<TRequest["operation"]>(request, result);
  }

  private async withTransferBudget<T>(
    size: number,
    body: () => Promise<T>,
  ): Promise<T> {
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > MAX_ASSET_BYTES - this.transferBytes
    )
      throw new Error("Asset transfer capacity exceeded");
    this.transferBytes += size;
    try {
      return await body();
    } finally {
      this.transferBytes -= size;
    }
  }

  private async requestMutation<
    TRequest extends Extract<
      EntityRpcRequest,
      { operation: "createEntity" | "updateEntity" | "upsertEntity" }
    >,
  >(request: TRequest): Promise<EntityRpcResults[TRequest["operation"]]> {
    const asset = request.request.preparedAsset;
    if (!asset || asset.bytes.byteLength <= ASSET_RPC_CHUNK_BYTES)
      return this.requestRemote(request);
    return this.withTransferBudget(asset.bytes.byteLength, async () => {
      assertPreparedAsset(asset);
      // Know the ID before admission so a failed/lost acknowledgement can be discarded.
      const uploadId = randomUUID();
      try {
        await this.requestRemote({
          operation: "beginAssetUpload",
          uploadId,
          asset: {
            ref: asset.ref,
            digest: asset.digest,
            sizeBytes: asset.sizeBytes,
          },
        });
        for (
          let offset = 0;
          offset < asset.bytes.byteLength;
          offset += ASSET_RPC_CHUNK_BYTES
        ) {
          await this.requestRemote({
            operation: "appendAssetUpload",
            uploadId,
            offset,
            bytes: asset.bytes.subarray(offset, offset + ASSET_RPC_CHUNK_BYTES),
          });
        }
        const mutation = {
          ...request,
          request: { ...request.request },
          assetUploadId: uploadId,
        };
        delete mutation.request.preparedAsset;
        return await this.requestRemote(mutation);
      } catch (error) {
        if (!this.closeRequested) {
          try {
            await this.requestRemote({
              operation: "discardAssetUpload",
              uploadId,
            });
          } catch (cleanupError) {
            throw new AggregateError(
              [error, cleanupError],
              "Asset transfer failed; remote cleanup could not be confirmed",
              { cause: cleanupError },
            );
          }
        }
        throw error;
      }
    });
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
    return this.requestMutation({
      operation: "createEntity",
      request,
    });
  }

  public createEntityFromMarkdown(
    request: CreateEntityFromMarkdownRequest,
  ): Promise<EntityMutationResult> {
    return this.requestRemote({
      operation: "createEntityFromMarkdown",
      request,
    });
  }

  public updateEntity<T extends BaseEntity>(
    request: UpdateEntityRequest<T>,
  ): Promise<EntityMutationResult> {
    return this.requestMutation({
      operation: "updateEntity",
      request,
    });
  }

  public deleteEntity(request: DeleteEntityRequest): Promise<boolean> {
    return this.requestRemote({ operation: "deleteEntity", request });
  }

  public upsertEntity<T extends BaseEntity>(
    request: UpsertEntityRequest<T>,
  ): Promise<EntityMutationResult & { created: boolean }> {
    return this.requestMutation({
      operation: "upsertEntity",
      request,
    });
  }

  public storeEmbedding(data: StoreEmbeddingData): Promise<void> {
    return this.requestRemote({ operation: "storeEmbedding", data });
  }

  public reconcileProjectionTargets(
    targets: readonly ProjectionChangedTarget[],
  ): Promise<void> {
    return this.requestRemote({
      operation: "reconcileProjectionTargets",
      targets,
    });
  }

  public backfillMissingEmbeddings(): Promise<EmbeddingBackfillResult> {
    this.indexReady = false;
    return this.requestRemote({
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
    const status = await this.requestRemote(
      { operation: "awaitIndexReady", options: rpcOptions },
      options.signal ? { signal: options.signal } : undefined,
    );
    if (status.ready) this.indexReady = true;
    return status;
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
    const entity = await this.requestRemote({
      operation: "getEntity",
      request,
    });
    if (!entity) return null;
    return schema ? schema.parse(entity) : entity;
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
    const entity = await this.requestRemote({
      operation: "getEntityRaw",
      request,
    });
    if (!entity) return null;
    return schema ? schema.parse(entity) : entity;
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
    const entities: BaseEntity[] = [];

    while (remaining > 0) {
      const limit = Math.min(remaining, ENTITY_RPC_LIST_PAGE_SIZE);
      const page = await this.requestRemote({
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

    return schema ? entities.map((entity) => schema.parse(entity)) : entities;
  }

  public async readAsset(ref: AssetRef): Promise<Uint8Array> {
    const stat = await this.statAsset(ref);
    if (!stat) throw new Error(`Asset not found: ${ref}`);
    if (stat.ref !== ref) throw new Error("Asset response reference mismatch");
    return this.withTransferBudget(stat.sizeBytes, async () => {
      const bytes = new Uint8Array(stat.sizeBytes);
      for (
        let offset = 0;
        offset < bytes.byteLength;
        offset += ASSET_RPC_CHUNK_BYTES
      ) {
        const length = Math.min(
          ASSET_RPC_CHUNK_BYTES,
          bytes.byteLength - offset,
        );
        const chunk = await this.readAssetChunk(ref, offset, length);
        if (chunk.byteLength !== length)
          throw new Error("Incomplete asset read chunk");
        bytes.set(chunk, offset);
      }
      if (computeAssetDigest(bytes) !== getAssetDigest(ref))
        throw new Error("Asset read digest mismatch");
      return bytes;
    });
  }

  public readAssetChunk(
    ref: AssetRef,
    offset: number,
    length: number,
  ): Promise<Uint8Array> {
    assetChunkRangeSchema.parse({ offset, length });
    return this.requestRemote({
      operation: "readAssetChunk",
      ref,
      offset,
      length,
    });
  }

  public statAsset(ref: AssetRef): Promise<AssetStat | null> {
    return this.requestRemote({ operation: "statAsset", ref });
  }

  public verifyAsset(ref: AssetRef): Promise<AssetVerification> {
    return this.requestRemote({ operation: "verifyAsset", ref });
  }

  public countEntities(request: CountEntitiesRequest): Promise<number> {
    return this.requestRemote({ operation: "countEntities", request });
  }

  public getEntityCounts(
    visibilityScope?: ContentVisibility,
  ): Promise<Array<{ entityType: string; count: number }>> {
    return this.requestRemote({
      operation: "getEntityCounts",
      ...(visibilityScope !== undefined && { visibilityScope }),
    });
  }

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
    const results = await this.requestRemote({
      operation: "search",
      request,
    });
    if (!schema) return results;
    return results.map((result) => ({
      ...result,
      entity: schema.parse(result.entity),
    }));
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
    return this.requestRemote({
      operation: "projectSemanticSpace",
      request,
    });
  }

  public countEmbeddings(): Promise<number> {
    return this.requestRemote({ operation: "countEmbeddings" });
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
    error?: string | undefined;
  } | null> {
    return this.requestRemote({ operation: "getAsyncJobStatus", jobId });
  }

  public async listPendingEntityExports(): Promise<EntityExportIntent[]> {
    const intents: EntityExportIntent[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const page = await this.requestRemote({
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
    return this.requestRemote({
      operation: "hasPendingEntityExports",
    });
  }

  public acknowledgeEntityExports(
    request: AcknowledgeEntityExportsRequest,
  ): Promise<number> {
    return this.requestRemote({
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
    return this.requestRemote({
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
