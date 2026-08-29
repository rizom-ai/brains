import { actorRefSchema } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { ProjectionBatchScopeSchema } from "./projection-rpc";
import type { ProjectionChangedTarget } from "./schema/projection-state";
import type {
  DurableBulkMutationRootInput,
  SettleDurableBulkMutationChildInput,
} from "./projection-store";
import type {
  BaseEntity,
  CountEntitiesRequest,
  CreateEntityFromMarkdownRequest,
  CreateEntityRequest,
  DeleteEntityRequest,
  EmbeddingBackfillResult,
  EntityMutationResult,
  EntitySearchRequest,
  EntityService,
  GetEntityRawRequest,
  GetEntityRequest,
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
const jobOptionsShape = {
  priority: z.number().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  eventContext: eventContextSchema.optional(),
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
});
const entityInputSchema = z.looseObject({
  id: z.string().optional(),
  entityType: nonEmptyString,
  content: z.string(),
  created: z.string().optional(),
  updated: z.string().optional(),
  visibility: z
    .union([contentVisibilitySchema, z.literal("private")])
    .optional(),
  metadata: metadataSchema,
});
const entitySchema = z.looseObject({
  id: nonEmptyString,
  entityType: nonEmptyString,
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: contentVisibilitySchema,
  metadata: metadataSchema,
  contentHash: z.string(),
});
const listFilterSchema = z.strictObject({
  metadata: metadataSchema.optional(),
  visibilityScope: contentVisibilitySchema.optional(),
});
const listOptionsSchema = z.strictObject({
  limit: z.number().int().nonnegative().optional(),
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
  limit: z.number().int().nonnegative().optional(),
  offset: z.number().int().nonnegative().optional(),
  types: z.array(nonEmptyString).optional(),
  excludeTypes: z.array(nonEmptyString).optional(),
  sortBy: z.enum(["relevance", "created", "updated"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  weight: z.record(z.string(), z.number()).optional(),
  visibilityScope: contentVisibilitySchema.optional(),
  includeUngenerated: z.boolean().optional(),
  minScore: z.number().optional(),
});
const semanticReferenceSchema = z.strictObject({
  entityId: nonEmptyString,
  entityType: nonEmptyString,
});
const projectSemanticSpaceRequestSchema = z.strictObject({
  types: z.array(nonEmptyString).optional(),
  origin: semanticReferenceSchema.optional(),
  maxNeighborDistance: z.number().optional(),
  visibilityScope: contentVisibilitySchema.optional(),
});
const changedTargetSchema = z.strictObject({
  entityType: nonEmptyString,
  entityId: nonEmptyString,
  operation: z.enum(["upsert", "delete"]),
  contentHash: nonEmptyString.optional(),
});

export const EntityRpcRequestSchema: z.ZodType<EntityRpcRequest, unknown> =
  z.discriminatedUnion("operation", [
    z.strictObject({
      operation: z.literal("createEntity"),
      request: z.strictObject({
        entity: entityInputSchema,
        options: createOptionsSchema.optional(),
      }),
    }),
    z.strictObject({
      operation: z.literal("createEntityFromMarkdown"),
      request: z.strictObject({
        input: z.strictObject({
          entityType: nonEmptyString,
          id: nonEmptyString,
          markdown: z.string(),
          visibility: contentVisibilitySchema.optional(),
        }),
        options: createOptionsSchema.optional(),
      }),
    }),
    z.strictObject({
      operation: z.literal("updateEntity"),
      request: z.strictObject({
        entity: entitySchema,
        options: updateOptionsSchema.optional(),
      }),
    }),
    z.strictObject({
      operation: z.literal("deleteEntity"),
      request: z.strictObject({
        entityType: nonEmptyString,
        id: nonEmptyString,
        options: deleteOptionsSchema.optional(),
      }),
    }),
    z.strictObject({
      operation: z.literal("upsertEntity"),
      request: z.strictObject({
        entity: entitySchema,
        options: jobOptionsSchema.optional(),
      }),
    }),
    z.strictObject({
      operation: z.literal("storeEmbedding"),
      data: z.strictObject({
        entityId: nonEmptyString,
        entityType: nonEmptyString,
        embedding: z.custom<Float32Array>(
          (value) => value instanceof Float32Array,
        ),
        contentHash: z.string(),
      }),
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
      request: getRequestSchema,
    }),
    z.strictObject({
      operation: z.literal("getEntityRaw"),
      request: getRequestSchema,
    }),
    z.strictObject({
      operation: z.literal("listEntities"),
      request: listRequestSchema,
    }),
    z.strictObject({
      operation: z.literal("countEntities"),
      request: countRequestSchema,
    }),
    z.strictObject({
      operation: z.literal("getEntityCounts"),
      visibilityScope: contentVisibilitySchema.optional(),
    }),
    z.strictObject({
      operation: z.literal("search"),
      request: z.strictObject({
        query: z.string(),
        options: searchOptionsSchema.optional(),
      }),
    }),
    z.strictObject({
      operation: z.literal("searchWithDistances"),
      request: z.strictObject({ query: z.string() }),
    }),
    z.strictObject({
      operation: z.literal("projectSemanticSpace"),
      request: projectSemanticSpaceRequestSchema,
    }),
    z.strictObject({ operation: z.literal("countEmbeddings") }),
    z.strictObject({
      operation: z.literal("getAsyncJobStatus"),
      jobId: nonEmptyString,
    }),
    z.strictObject({
      operation: z.literal("prepareDurableBulkMutation"),
      input: z.strictObject({
        source: nonEmptyString,
        operationId: nonEmptyString,
        rootJobId: nonEmptyString,
      }),
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
      input: z.strictObject({
        operationId: nonEmptyString,
        childKey: nonEmptyString,
        jobId: nonEmptyString,
        outcome: z.enum(["completed", "failed"]),
      }),
    }),
    // Boundary cast, deliberate: zod optionals are `T | undefined` under
    // exactOptionalPropertyTypes while the domain types use plain optionals.
    // Reconciling without a cast means rewriting the domain types as schema
    // outputs — tracked as a follow-up, not smuggled into this layer.
  ]) as z.ZodType<EntityRpcRequest, unknown>;

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

export function parseEntityRpcResult(
  request: EntityRpcRequest,
  input: unknown,
): unknown {
  switch (request.operation) {
    case "createEntity":
    case "createEntityFromMarkdown":
    case "updateEntity":
      return mutationResultSchema.parse(input);
    case "upsertEntity":
      return mutationResultSchema.extend({ created: z.boolean() }).parse(input);
    case "deleteEntity":
      return z.boolean().parse(input);
    case "storeEmbedding":
    case "reconcileProjectionTargets":
      return z.undefined().parse(input);
    case "backfillMissingEmbeddings":
      return z
        .strictObject({
          queued: z.number().int().nonnegative(),
          skipped: z.number().int().nonnegative(),
        })
        .parse(input);
    case "awaitIndexReady":
      return readinessSchema.parse(input);
    case "getEntity":
    case "getEntityRaw":
      return input === null ? null : entitySchema.parse(input);
    case "listEntities":
      return z.array(entitySchema).parse(input);
    case "countEntities":
    case "countEmbeddings":
      return z.number().int().nonnegative().parse(input);
    case "getEntityCounts":
      return z
        .array(
          z.strictObject({
            entityType: nonEmptyString,
            count: z.number().int().nonnegative(),
          }),
        )
        .parse(input);
    case "search":
      return z.array(searchResultSchema).parse(input);
    case "searchWithDistances":
      return z.array(distanceResultSchema).parse(input);
    case "projectSemanticSpace":
      return semanticSpaceSchema.parse(input);
    case "getAsyncJobStatus":
      return input === null
        ? null
        : z
            .strictObject({
              status: z.enum(["pending", "processing", "completed", "failed"]),
              error: z.string().optional(),
            })
            .parse(input);
    case "settleDurableBulkMutationChild":
      return z.boolean().parse(input);
    case "prepareDurableBulkMutation":
    case "finalizeDurableBulkMutationEnqueue":
    case "failDurableBulkMutationEnqueue":
      return z.undefined().parse(input);
  }
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
