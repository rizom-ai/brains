import { preparedAssetSchema } from "@brains/assets";
import { actorRefSchema } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { ProjectionBatchScopeSchema } from "./projection-rpc";
import type { ProjectionChangedTarget } from "./schema/projection-state";
import type {
  BaseEntity,
  CountEntitiesRequest,
  CreateEntityFromMarkdownRequest,
  CreateEntityRequest,
  DeleteEntityRequest,
  DurableBulkMutationRootInput,
  EmbeddingBackfillResult,
  EntityMutationResult,
  EntitySearchRequest,
  EntityService,
  GetEntityRawRequest,
  GetEntityRequest,
  IndexReadinessStatus,
  ListEntitiesRequest,
  ProjectSemanticSpaceRequest,
  ProjectionOwnedEntityRequest,
  SearchResult,
  SearchWithDistancesRequest,
  SemanticSpaceProjection,
  SettleDurableBulkMutationChildInput,
  StoreEmbeddingData,
  UpdateEntityRequest,
  UpsertEntityRequest,
} from "./types";
import type {
  AcknowledgeEntityExportsRequest,
  EntityExportIntent,
} from "./entity-export-types";
import { contentVisibilitySchema } from "./visibility";

export const ENTITY_RPC_SERVICE = "entity";

export interface EntityRpcTransport {
  initialize(): Promise<void>;
  request(
    payload: EntityRpcCall,
    options?: { signal?: AbortSignal | undefined },
  ): Promise<unknown>;
  close(): void;
}

export interface EntityIndexReadinessRpcOptions {
  timeoutMs?: number | undefined;
  intervalMs?: number | undefined;
}

export type EntityRpcRequest =
  | { operation: "createEntity"; request: CreateEntityRequest<BaseEntity> }
  | {
      operation: "createEntityFromMarkdown";
      request: CreateEntityFromMarkdownRequest;
    }
  | { operation: "updateEntity"; request: UpdateEntityRequest<BaseEntity> }
  | { operation: "deleteEntity"; request: DeleteEntityRequest }
  | { operation: "upsertEntity"; request: UpsertEntityRequest<BaseEntity> }
  | { operation: "storeEmbedding"; data: StoreEmbeddingData }
  | {
      operation: "reconcileProjectionTargets";
      targets: readonly ProjectionChangedTarget[];
    }
  | { operation: "backfillMissingEmbeddings" }
  | {
      operation: "awaitIndexReady";
      options: EntityIndexReadinessRpcOptions;
    }
  | { operation: "getEntity"; request: GetEntityRequest }
  | { operation: "getEntityRaw"; request: GetEntityRawRequest }
  | { operation: "listEntities"; request: ListEntitiesRequest }
  | { operation: "countEntities"; request: CountEntitiesRequest }
  | {
      operation: "getEntityCounts";
      visibilityScope?: "public" | "shared" | "restricted" | undefined;
    }
  | { operation: "search"; request: EntitySearchRequest }
  | {
      operation: "searchWithDistances";
      request: SearchWithDistancesRequest;
    }
  | {
      operation: "projectSemanticSpace";
      request: ProjectSemanticSpaceRequest;
    }
  | { operation: "countEmbeddings" }
  | {
      operation: "isProjectionOwnedEntity";
      request: ProjectionOwnedEntityRequest;
    }
  | { operation: "listPendingEntityExports"; offset: number; limit: number }
  | {
      operation: "acknowledgeEntityExports";
      request: AcknowledgeEntityExportsRequest;
    }
  | { operation: "hasPendingEntityExports" }
  | { operation: "getAsyncJobStatus"; jobId: string }
  | {
      operation: "prepareDurableBulkMutation";
      input: DurableBulkMutationRootInput;
    }
  | { operation: "finalizeDurableBulkMutationEnqueue"; operationId: string }
  | { operation: "failDurableBulkMutationEnqueue"; operationId: string }
  | {
      operation: "settleDurableBulkMutationChild";
      input: SettleDurableBulkMutationChildInput;
    };

const nonEmptyString = z.string().min(1);
const metadataSchema = z.record(z.string(), z.unknown());
const eventContextSchema = z.strictObject({
  conversationId: z.string().optional(),
  channelId: z.string().optional(),
  runId: z.string().optional(),
  toolCallId: z.string().optional(),
  actor: actorRefSchema.optional(),
  interfaceType: z.string().optional(),
});
const persistenceOriginSchema = z.enum(["ordinary", "directory-sync"]);
const jobOptionsShape = {
  priority: z.number().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  eventContext: eventContextSchema.optional(),
  persistenceOrigin: persistenceOriginSchema.optional(),
};
const createOptionsSchema = z.strictObject({
  ...jobOptionsShape,
  deduplicateId: z.boolean().optional(),
});
const updateOptionsSchema = z.strictObject({
  ...jobOptionsShape,
  expectedContentHash: z.string().optional(),
});
const jobOptionsSchema = z.strictObject(jobOptionsShape);
const deleteOptionsSchema = z.strictObject({
  eventContext: eventContextSchema.optional(),
  persistenceOrigin: persistenceOriginSchema.optional(),
});
const entityInputSchema = z.looseObject({
  id: z.string().optional(),
  entityType: nonEmptyString,
  content: z.string(),
  created: z.string().datetime().optional(),
  updated: z.string().datetime().optional(),
  visibility: z
    .union([contentVisibilitySchema, z.literal("private")])
    .optional(),
  metadata: metadataSchema,
});
const entitySchema = z.looseObject({
  id: nonEmptyString,
  entityType: nonEmptyString,
  content: z.string(),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  visibility: contentVisibilitySchema,
  metadata: metadataSchema,
  contentHash: z.string(),
});
const listFilterSchema = z.strictObject({
  metadata: metadataSchema.optional(),
  visibilityScope: contentVisibilitySchema.optional(),
});
const listOptionsSchema = z.strictObject({
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
  sortFields: z
    .array(
      z.strictObject({
        field: nonEmptyString,
        direction: z.enum(["asc", "desc"]),
        nullsFirst: z.boolean().optional(),
      }),
    )
    .optional(),
  filter: listFilterSchema.optional(),
  publishedOnly: z.boolean().optional(),
});
const getRequestSchema = z.strictObject({
  entityType: nonEmptyString,
  id: nonEmptyString,
  visibilityScope: contentVisibilitySchema.optional(),
});
const listRequestSchema = z.strictObject({
  entityType: nonEmptyString,
  options: listOptionsSchema.optional(),
});
const countRequestSchema = z.strictObject({
  entityType: nonEmptyString,
  options: z
    .strictObject({
      filter: listFilterSchema.optional(),
      publishedOnly: z.boolean().optional(),
    })
    .optional(),
});
const searchOptionsSchema = z.strictObject({
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
  types: z.array(nonEmptyString).optional(),
  excludeTypes: z.array(nonEmptyString).optional(),
  sortBy: z.enum(["relevance", "created", "updated"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  weight: z.record(z.string(), z.number()).optional(),
  visibilityScope: contentVisibilitySchema.optional(),
  includeUngenerated: z.boolean().optional(),
  minScore: z.number().min(0).optional(),
});
const semanticReferenceSchema = z.strictObject({
  entityId: nonEmptyString,
  entityType: nonEmptyString,
});
export const projectSemanticSpaceRequestSchema: z.ZodType<
  ProjectSemanticSpaceRequest,
  unknown
> = z.strictObject({
  types: z.array(nonEmptyString).optional(),
  origin: semanticReferenceSchema.optional(),
  maxNeighborDistance: z.number().min(0).max(2).optional(),
  visibilityScope: contentVisibilitySchema.optional(),
});
const changedTargetSchema = z.strictObject({
  entityType: nonEmptyString,
  entityId: nonEmptyString,
  operation: z.enum(["upsert", "delete"]),
  contentHash: nonEmptyString.optional(),
});

export const createEntityRequestSchema: z.ZodType<
  CreateEntityRequest<BaseEntity>,
  unknown
> = z.strictObject({
  entity: entityInputSchema,
  preparedAsset: preparedAssetSchema.optional(),
  options: createOptionsSchema.optional(),
});
export const createEntityFromMarkdownRequestSchema: z.ZodType<
  CreateEntityFromMarkdownRequest,
  unknown
> = z.strictObject({
  input: z.strictObject({
    entityType: nonEmptyString,
    id: nonEmptyString,
    markdown: z.string(),
    visibility: contentVisibilitySchema.optional(),
  }),
  options: createOptionsSchema.optional(),
});
export const updateEntityRequestSchema: z.ZodType<
  UpdateEntityRequest<BaseEntity>,
  unknown
> = z.strictObject({
  entity: entitySchema,
  preparedAsset: preparedAssetSchema.optional(),
  options: updateOptionsSchema.optional(),
});
export const deleteEntityRequestSchema: z.ZodType<
  DeleteEntityRequest,
  unknown
> = z.strictObject({
  entityType: nonEmptyString,
  id: nonEmptyString,
  options: deleteOptionsSchema.optional(),
});
export const upsertEntityRequestSchema: z.ZodType<
  UpsertEntityRequest<BaseEntity>,
  unknown
> = z.strictObject({
  entity: entitySchema,
  preparedAsset: preparedAssetSchema.optional(),
  options: jobOptionsSchema.optional(),
});
export const getEntityRequestSchema: z.ZodType<GetEntityRequest, unknown> =
  getRequestSchema;
export const listEntitiesRequestSchema: z.ZodType<
  ListEntitiesRequest,
  unknown
> = listRequestSchema;
export const countEntitiesRequestSchema: z.ZodType<
  CountEntitiesRequest,
  unknown
> = countRequestSchema;
export const ENTITY_RPC_LIST_PAGE_SIZE: number = 100;
export const ENTITY_RPC_EXPORT_PAGE_SIZE: number = 100;
const entityRpcListRequestSchema = z.strictObject({
  entityType: nonEmptyString,
  options: listOptionsSchema.extend({
    limit: z.number().int().positive().max(ENTITY_RPC_LIST_PAGE_SIZE),
  }),
});
export const entitySearchRequestSchema: z.ZodType<
  EntitySearchRequest,
  unknown
> = z.strictObject({
  query: z.string(),
  options: searchOptionsSchema.optional(),
});
export const searchWithDistancesRequestSchema: z.ZodType<
  SearchWithDistancesRequest,
  unknown
> = z.strictObject({
  query: z.string(),
});
export const storeEmbeddingDataSchema: z.ZodType<StoreEmbeddingData, unknown> =
  z.strictObject({
    entityId: nonEmptyString,
    entityType: nonEmptyString,
    embedding: z.custom<Float32Array>((value) => value instanceof Float32Array),
    contentHash: z.string(),
  });
export const durableBulkMutationRootInputSchema: z.ZodType<
  DurableBulkMutationRootInput,
  unknown
> = z.strictObject({
  source: nonEmptyString,
  operationId: nonEmptyString,
  rootJobId: nonEmptyString,
  expectedChildren: z.number().int().positive().max(10_000),
});
export const settleDurableBulkMutationChildInputSchema: z.ZodType<
  SettleDurableBulkMutationChildInput,
  unknown
> = z.strictObject({
  operationId: nonEmptyString,
  childKey: nonEmptyString,
  jobId: nonEmptyString,
  outcome: z.enum(["completed", "failed"]),
});

export const EntityRpcRequestSchema: z.ZodType<EntityRpcRequest, unknown> =
  z.discriminatedUnion("operation", [
    z.strictObject({
      operation: z.literal("createEntity"),
      request: createEntityRequestSchema,
    }),
    z.strictObject({
      operation: z.literal("createEntityFromMarkdown"),
      request: createEntityFromMarkdownRequestSchema,
    }),
    z.strictObject({
      operation: z.literal("updateEntity"),
      request: updateEntityRequestSchema,
    }),
    z.strictObject({
      operation: z.literal("deleteEntity"),
      request: deleteEntityRequestSchema,
    }),
    z.strictObject({
      operation: z.literal("upsertEntity"),
      request: upsertEntityRequestSchema,
    }),
    z.strictObject({
      operation: z.literal("storeEmbedding"),
      data: storeEmbeddingDataSchema,
    }),
    z.strictObject({
      operation: z.literal("reconcileProjectionTargets"),
      targets: z.array(changedTargetSchema),
    }),
    z.strictObject({ operation: z.literal("backfillMissingEmbeddings") }),
    z.strictObject({
      operation: z.literal("awaitIndexReady"),
      options: z.strictObject({
        timeoutMs: z.number().int().nonnegative().optional(),
        intervalMs: z.number().int().positive().optional(),
      }),
    }),
    z.strictObject({
      operation: z.literal("getEntity"),
      request: getEntityRequestSchema,
    }),
    z.strictObject({
      operation: z.literal("getEntityRaw"),
      request: getEntityRequestSchema,
    }),
    z.strictObject({
      operation: z.literal("listEntities"),
      request: entityRpcListRequestSchema,
    }),
    z.strictObject({
      operation: z.literal("countEntities"),
      request: countEntitiesRequestSchema,
    }),
    z.strictObject({
      operation: z.literal("getEntityCounts"),
      visibilityScope: contentVisibilitySchema.optional(),
    }),
    z.strictObject({
      operation: z.literal("search"),
      request: entitySearchRequestSchema,
    }),
    z.strictObject({
      operation: z.literal("searchWithDistances"),
      request: searchWithDistancesRequestSchema,
    }),
    z.strictObject({
      operation: z.literal("projectSemanticSpace"),
      request: projectSemanticSpaceRequestSchema,
    }),
    z.strictObject({ operation: z.literal("countEmbeddings") }),
    z.strictObject({
      operation: z.literal("isProjectionOwnedEntity"),
      request: z.strictObject({
        entityType: nonEmptyString,
        id: nonEmptyString,
      }),
    }),
    z.strictObject({
      operation: z.literal("listPendingEntityExports"),
      offset: z.number().int().nonnegative(),
      limit: z.number().int().positive().max(ENTITY_RPC_EXPORT_PAGE_SIZE),
    }),
    z.strictObject({
      operation: z.literal("acknowledgeEntityExports"),
      request: z.strictObject({
        intents: z.array(
          z.strictObject({
            entityType: nonEmptyString,
            entityId: nonEmptyString,
            revision: nonEmptyString,
          }),
        ),
      }),
    }),
    z.strictObject({ operation: z.literal("hasPendingEntityExports") }),
    z.strictObject({
      operation: z.literal("getAsyncJobStatus"),
      jobId: nonEmptyString,
    }),
    z.strictObject({
      operation: z.literal("prepareDurableBulkMutation"),
      input: durableBulkMutationRootInputSchema,
    }),
    z.strictObject({
      operation: z.literal("finalizeDurableBulkMutationEnqueue"),
      operationId: nonEmptyString,
    }),
    z.strictObject({
      operation: z.literal("failDurableBulkMutationEnqueue"),
      operationId: nonEmptyString,
    }),
    z.strictObject({
      operation: z.literal("settleDurableBulkMutationChild"),
      input: settleDurableBulkMutationChildInputSchema,
    }),
  ]);

const mutationResultSchema = z.strictObject({
  entityId: nonEmptyString,
  jobId: z.string(),
  skipped: z.boolean(),
  skipReason: z.literal("content-conflict").optional(),
});
const searchResultSchema = z.strictObject({
  entity: entitySchema,
  score: z.number(),
  excerpt: z.string(),
});
const distanceResultSchema = z.strictObject({
  entityId: nonEmptyString,
  entityType: nonEmptyString,
  distance: z.number(),
});
const semanticSpaceSchema = z.strictObject({
  origin: z.union([
    z.strictObject({ kind: z.literal("centroid") }),
    z.strictObject({
      kind: z.literal("entity"),
      ...semanticReferenceSchema.shape,
    }),
  ]),
  points: z.array(
    z.strictObject({
      ...semanticReferenceSchema.shape,
      coordinates: z.tuple([z.number(), z.number()]),
      distanceToOrigin: z.number(),
    }),
  ),
  neighbors: z.array(
    z.strictObject({
      source: semanticReferenceSchema,
      target: semanticReferenceSchema,
      distance: z.number(),
    }),
  ),
  distanceRange: z.strictObject({ min: z.number(), max: z.number() }),
});
const entityExportIntentSchema: z.ZodType<EntityExportIntent, unknown> =
  z.strictObject({
    entityType: nonEmptyString,
    entityId: nonEmptyString,
    operation: z.enum(["upsert", "delete"]),
    revision: nonEmptyString,
    markedAt: z.number(),
  });
const readinessSchema = z.strictObject({
  ready: z.boolean(),
  degraded: z.boolean(),
  activeEmbeddingJobs: z.number().int().nonnegative(),
  missingEmbeddings: z.number().int().nonnegative(),
  staleEmbeddings: z.number().int().nonnegative(),
  failedEmbeddings: z.number().int().nonnegative(),
  embeddableEntities: z.number().int().nonnegative(),
  embeddedEntities: z.number().int().nonnegative(),
});

export function parseEntityRpcRequest(input: unknown): EntityRpcRequest {
  return EntityRpcRequestSchema.parse(input);
}

/**
 * A request plus the caller's active projection batch scope.
 *
 * A worker runs a bulk-mutation body in its own process while the writes land
 * in the owner's database, so it sends the scope it opened remotely. The owner
 * re-enters that scope before dispatch, which is what keeps `withDirtyInput`
 * fencing worker-originated writes against the batch.
 */
const EntityRpcCallSchema = z.strictObject({
  request: z.unknown(),
  batchScope: ProjectionBatchScopeSchema.optional(),
});

export interface EntityRpcCall {
  request: EntityRpcRequest;
  batchScope?: z.output<typeof ProjectionBatchScopeSchema> | undefined;
}

export function parseEntityRpcCall(input: unknown): EntityRpcCall {
  const enveloped = EntityRpcCallSchema.safeParse(input);
  if (!enveloped.success) {
    // A bare request predates the envelope and never carries a batch scope.
    return { request: parseEntityRpcRequest(input) };
  }
  const { request, batchScope } = enveloped.data;
  return {
    request: parseEntityRpcRequest(request),
    ...(batchScope !== undefined && { batchScope }),
  };
}

const nullableEntitySchema = entitySchema.nullable();
const entityListSchema = z.array(entitySchema);
const booleanResultSchema = z.boolean();
const undefinedResultSchema = z.undefined();
const nonNegativeIntSchema = z.number().int().nonnegative();
const entityCountsSchema = z.array(
  z.strictObject({
    entityType: nonEmptyString,
    count: nonNegativeIntSchema,
  }),
);
const backfillResultSchema = z.strictObject({
  queued: nonNegativeIntSchema,
  skipped: nonNegativeIntSchema,
});
const asyncJobStatusSchema = z
  .strictObject({
    status: z.enum(["pending", "processing", "completed", "failed"]),
    error: z.string().optional(),
  })
  .nullable();
const upsertResultSchema = mutationResultSchema.extend({
  created: z.boolean(),
});

/**
 * What each operation answers. The schema map below is checked against this,
 * so the two cannot drift, and keying both by operation is what lets
 * `parseEntityRpcResult` return the operation's own type — callers no longer
 * re-assert it at the transport boundary.
 */
export interface EntityRpcResults {
  createEntity: EntityMutationResult;
  createEntityFromMarkdown: EntityMutationResult;
  updateEntity: EntityMutationResult;
  upsertEntity: EntityMutationResult & { created: boolean };
  deleteEntity: boolean;
  storeEmbedding: undefined;
  reconcileProjectionTargets: undefined;
  backfillMissingEmbeddings: EmbeddingBackfillResult;
  awaitIndexReady: IndexReadinessStatus;
  getEntity: BaseEntity | null;
  getEntityRaw: BaseEntity | null;
  listEntities: BaseEntity[];
  countEntities: number;
  countEmbeddings: number;
  acknowledgeEntityExports: number;
  isProjectionOwnedEntity: boolean;
  hasPendingEntityExports: boolean;
  listPendingEntityExports: EntityExportIntent[];
  getEntityCounts: Array<{ entityType: string; count: number }>;
  search: SearchResult<BaseEntity>[];
  searchWithDistances: Array<{
    entityId: string;
    entityType: string;
    distance: number;
  }>;
  projectSemanticSpace: SemanticSpaceProjection;
  getAsyncJobStatus: {
    status: "pending" | "processing" | "completed" | "failed";
    error?: string | undefined;
  } | null;
  settleDurableBulkMutationChild: boolean;
  prepareDurableBulkMutation: undefined;
  finalizeDurableBulkMutationEnqueue: undefined;
  failDurableBulkMutationEnqueue: undefined;
}

export type EntityRpcOperation = keyof EntityRpcResults;

const resultSchemas: {
  [Op in EntityRpcOperation]: z.ZodType<EntityRpcResults[Op], unknown>;
} = {
  createEntity: mutationResultSchema,
  createEntityFromMarkdown: mutationResultSchema,
  updateEntity: mutationResultSchema,
  upsertEntity: upsertResultSchema,
  deleteEntity: booleanResultSchema,
  storeEmbedding: undefinedResultSchema,
  reconcileProjectionTargets: undefinedResultSchema,
  backfillMissingEmbeddings: backfillResultSchema,
  awaitIndexReady: readinessSchema,
  getEntity: nullableEntitySchema,
  getEntityRaw: nullableEntitySchema,
  listEntities: entityListSchema,
  countEntities: nonNegativeIntSchema,
  countEmbeddings: nonNegativeIntSchema,
  acknowledgeEntityExports: nonNegativeIntSchema,
  isProjectionOwnedEntity: booleanResultSchema,
  hasPendingEntityExports: booleanResultSchema,
  listPendingEntityExports: z.array(entityExportIntentSchema),
  getEntityCounts: entityCountsSchema,
  search: z.array(searchResultSchema),
  searchWithDistances: z.array(distanceResultSchema),
  projectSemanticSpace: semanticSpaceSchema,
  getAsyncJobStatus: asyncJobStatusSchema,
  settleDurableBulkMutationChild: booleanResultSchema,
  prepareDurableBulkMutation: undefinedResultSchema,
  finalizeDurableBulkMutationEnqueue: undefinedResultSchema,
  failDurableBulkMutationEnqueue: undefinedResultSchema,
};

export function parseEntityRpcResult<Op extends EntityRpcOperation>(
  request: { operation: Op },
  input: unknown,
): EntityRpcResults[Op] {
  return resultSchemas[request.operation].parse(input);
}

/** Dispatch one validated request against the web-owned entity service. */
export function handleEntityRpcRequest(
  service: EntityService,
  input: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  signal?.throwIfAborted();
  const request = parseEntityRpcRequest(input);
  switch (request.operation) {
    case "createEntity":
      return service.createEntity(request.request);
    case "createEntityFromMarkdown":
      return service.createEntityFromMarkdown(request.request);
    case "updateEntity":
      return service.updateEntity(request.request);
    case "deleteEntity":
      return service.deleteEntity(request.request);
    case "upsertEntity":
      return service.upsertEntity(request.request);
    case "storeEmbedding":
      return service.storeEmbedding(request.data);
    case "reconcileProjectionTargets":
      return service.reconcileProjectionTargets(request.targets);
    case "backfillMissingEmbeddings":
      return service.backfillMissingEmbeddings();
    case "awaitIndexReady":
      return service.awaitIndexReady({
        ...(request.options.timeoutMs !== undefined && {
          timeoutMs: request.options.timeoutMs,
        }),
        ...(request.options.intervalMs !== undefined && {
          intervalMs: request.options.intervalMs,
        }),
        ...(signal && { signal }),
      });
    case "getEntity":
      return service.getEntity(request.request);
    case "getEntityRaw":
      return service.getEntityRaw(request.request);
    case "listEntities":
      return service.listEntities(request.request);
    case "countEntities":
      return service.countEntities(request.request);
    case "getEntityCounts":
      return service.getEntityCounts(request.visibilityScope);
    case "search":
      return service.search(request.request);
    case "searchWithDistances":
      return service.searchWithDistances(request.request);
    case "projectSemanticSpace":
      return service.projectSemanticSpace(request.request);
    case "countEmbeddings":
      return service.countEmbeddings();
    case "isProjectionOwnedEntity":
      return service.isProjectionOwnedEntity(request.request);
    case "listPendingEntityExports":
      return service
        .listPendingEntityExports()
        .then((intents) =>
          intents.slice(request.offset, request.offset + request.limit),
        );
    case "acknowledgeEntityExports":
      return service.acknowledgeEntityExports(request.request);
    case "hasPendingEntityExports":
      return service.hasPendingEntityExports();
    case "getAsyncJobStatus":
      return service.getAsyncJobStatus(request.jobId);
    case "prepareDurableBulkMutation":
      return service.prepareDurableBulkMutation(request.input);
    case "finalizeDurableBulkMutationEnqueue":
      return service.finalizeDurableBulkMutationEnqueue(request.operationId);
    case "failDurableBulkMutationEnqueue":
      return service.failDurableBulkMutationEnqueue(request.operationId);
    case "settleDurableBulkMutationChild":
      return service.settleDurableBulkMutationChild(request.input);
  }
}

export type {
  EmbeddingBackfillResult,
  EntityMutationResult,
  IndexReadinessStatus,
  SearchResult,
  SemanticSpaceProjection,
};
