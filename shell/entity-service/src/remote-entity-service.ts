import { SHELL_CHANNELS } from "@brains/contracts";
import type { IJobQueueService } from "@brains/job-queue";
import { Logger } from "@brains/utils/logger";
import type { IEmbeddingService } from "./embedding-types";
import { EntitySerializer } from "./entity-serializer";
import { EmbeddingJobHandler } from "./handlers/embeddingJobHandler";
import {
  parseEntityRpcResult,
  type EntityIndexReadinessRpcOptions,
  type EntityRpcRequest,
  type EntityRpcTransport,
} from "./entity-rpc";
import { RemoteProjectionStore } from "./remote-projection-store";
import type { ProjectionStoreRpcTransport } from "./projection-rpc";
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
  private initialization: Promise<void> | undefined;
  private closeRequested = false;
  private embeddingHandlerRegistered = false;
  private indexReady = false;
  private projectionWakeup: (() => Promise<void>) | undefined;

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
    const result = await this.transport.request(request, options);
    return parseEntityRpcResult(request, result) as T;
  }

  public getProjectionStore(): RemoteProjectionStore {
    return this.projectionStore;
  }

  public setProjectionWakeup(wakeup: () => Promise<void>): () => void {
    this.projectionWakeup = wakeup;
    let active = true;
    return (): void => {
      if (!active) return;
      active = false;
      if (this.projectionWakeup === wakeup) this.projectionWakeup = undefined;
    };
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

  public listEntities<T extends BaseEntity>(
    request: ListEntitiesRequest,
  ): Promise<T[]> {
    return this.requestRemote<T[]>({ operation: "listEntities", request });
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
}
