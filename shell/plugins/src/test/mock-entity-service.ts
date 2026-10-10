import {
  getVisibleContentVisibilities,
  entityRevision,
  EntityWriteConflictError,
  normalizeContentVisibility,
  type BaseEntity,
  type CreateEntityRequest,
  type EntityMutationResult,
  type EntitySchema,
  type GetEntityRequest,
  type IEntityService,
  type ListEntitiesRequest,
  type UpdateEntityRequest,
  type UpsertEntityRequest,
} from "@brains/entity-service";
import { computeContentHash } from "@brains/utils/hash";
import type { MockEntityStore } from "./mock-entity-store";
import { createMockReceiptMethods } from "./mock-entity-receipts";

/**
 * A stateful EntityService double over a shared store.
 *
 * It fakes what a map can honestly fake — create, read, update, delete, list,
 * and the export-intent bookkeeping — and refuses the rest loudly. A fake that
 * quietly returned nothing for a database-backed query would make a test
 * asserting that query meaningless.
 */
export function createMockEntityService(
  store: MockEntityStore,
): IEntityService {
  // Overloaded like the real service: without a schema reads return the
  // stored BaseEntity view; with one they parse, so T is proven not asserted.
  async function getEntityFake(
    request: GetEntityRequest,
  ): Promise<BaseEntity | null>;
  async function getEntityFake<T extends BaseEntity>(
    request: GetEntityRequest,
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  async function getEntityFake(
    request: GetEntityRequest,
    schema?: EntitySchema<BaseEntity>,
  ): Promise<BaseEntity | null> {
    const entity = store.entities.get(request.id);
    if (entity?.entityType !== request.entityType) return null;
    // Fail closed like the real query layer: unscoped reads see public only.
    const visible = getVisibleContentVisibilities(
      request.visibilityScope ?? "public",
    ).includes(entity.visibility);
    if (!visible) return null;
    return schema ? schema.parse(entity) : entity;
  }

  // Mirrors the real query layer's ORDER BY: system fields come from the
  // entity, everything else from metadata; NULLs sort smallest (SQLite),
  // and nullsFirst / nullsLast force them ahead / behind regardless of direction.
  function sortFieldValue(entity: BaseEntity, field: string): unknown {
    if (field === "id" || field === "created" || field === "updated") {
      return entity[field];
    }
    return entity.metadata[field];
  }

  function compareBySortFields(
    left: BaseEntity,
    right: BaseEntity,
    sortFields: NonNullable<
      NonNullable<ListEntitiesRequest["options"]>["sortFields"]
    >,
  ): number {
    for (const { field, direction, nullsFirst, nullsLast } of sortFields) {
      const a = sortFieldValue(left, field);
      const b = sortFieldValue(right, field);
      const aNull = a === null || a === undefined;
      const bNull = b === null || b === undefined;
      if (aNull || bNull) {
        if (aNull && bNull) continue;
        if (nullsFirst) return aNull ? -1 : 1;
        if (nullsLast) return aNull ? 1 : -1;
        // SQLite: NULL is smaller than every value.
        const nullCmp = aNull ? -1 : 1;
        if (direction === "desc") return -nullCmp;
        return nullCmp;
      }
      const cmp =
        typeof a === "number" && typeof b === "number"
          ? a - b
          : String(a) < String(b)
            ? -1
            : String(a) > String(b)
              ? 1
              : 0;
      if (cmp !== 0) return direction === "desc" ? -cmp : cmp;
    }
    return 0;
  }

  function filterEntitiesFake(request: ListEntitiesRequest): BaseEntity[] {
    // Fail closed like the real query layer: unscoped reads see public only.
    const visible = new Set(
      getVisibleContentVisibilities(
        request.options?.filter?.visibilityScope ?? "public",
      ),
    );
    let results = Array.from(store.entities.values()).filter(
      (e) => e.entityType === request.entityType && visible.has(e.visibility),
    );
    const exactVisibility = request.options?.filter?.visibility;
    if (exactVisibility)
      results = results.filter(
        (entity) => entity.visibility === exactVisibility,
      );
    const contentContains = request.options?.filter?.contentContains
      ?.trim()
      .toLowerCase();
    if (contentContains)
      results = results.filter((entity) =>
        entity.content.toLowerCase().includes(contentContains),
      );
    if (request.options?.publishedOnly) {
      results = results.filter((e) => e.metadata["status"] === "published");
    }
    if (request.options?.filter?.metadata) {
      const filterEntries = Object.entries(request.options.filter.metadata);
      results = results.filter((e) =>
        filterEntries.every(([key, value]) => e.metadata[key] === value),
      );
    }
    return results;
  }

  async function listEntitiesFake(
    request: ListEntitiesRequest,
  ): Promise<BaseEntity[]>;
  async function listEntitiesFake<T extends BaseEntity>(
    request: ListEntitiesRequest,
    schema: EntitySchema<T>,
  ): Promise<T[]>;
  async function listEntitiesFake(
    request: ListEntitiesRequest,
    schema?: EntitySchema<BaseEntity>,
  ): Promise<BaseEntity[]> {
    const sortFields = request.options?.sortFields ?? [
      { field: "updated", direction: "desc" as const },
    ];
    const offset = request.options?.offset ?? 0;
    const limit = request.options?.limit;
    const results = filterEntitiesFake(request)
      .sort((left, right) => compareBySortFields(left, right, sortFields))
      .slice(offset, limit === undefined ? undefined : offset + limit);
    return schema ? results.map((entity) => schema.parse(entity)) : results;
  }

  const service: IEntityService = {
    ...createMockReceiptMethods(store),
    createEntity: async <T extends BaseEntity>(
      request: CreateEntityRequest<T>,
    ): Promise<EntityMutationResult> => {
      // `EntityInput<T>` leaves id, timestamps and contentHash to the service,
      // so the fake fills them the way the real one does rather than assuming
      // the caller passed a complete entity.
      const input = request.entity;
      const now = new Date().toISOString();
      const id = input.id ?? `entity-${Date.now()}`;
      const entity: BaseEntity = {
        ...input,
        id,
        visibility: normalizeContentVisibility(input.visibility),
        created: input.created ?? now,
        updated: input.updated ?? now,
        content: input.content,
        metadata: input.metadata,
        entityType: input.entityType,
        contentHash: "",
      };
      store.types.add(entity.entityType);
      const { content, metadata } = store.serialize(entity);
      store.entities.set(id, {
        ...entity,
        content,
        metadata,
        contentHash: computeContentHash(content),
      });
      store.markExportIntent(
        entity.entityType,
        id,
        "upsert",
        request.options?.persistenceOrigin,
      );
      return { entityId: id, jobId: `job-${id}`, skipped: false };
    },
    createEntityFromMarkdown: async (request: {
      input: {
        entityType: string;
        id: string;
        markdown: string;
        visibility?: BaseEntity["visibility"];
      };
    }): Promise<EntityMutationResult> => {
      const adapter = store.adapters.get(request.input.entityType);
      const parsed = adapter?.fromMarkdown(request.input.markdown) ?? {
        entityType: request.input.entityType,
        content: request.input.markdown,
        metadata: {},
      };
      const now = new Date().toISOString();
      const entity: BaseEntity = {
        ...parsed,
        id: request.input.id,
        entityType: request.input.entityType,
        content: parsed.content ?? request.input.markdown,
        metadata: parsed.metadata ?? {},
        // As the entity service does: an explicit visibility is kept.
        visibility: request.input.visibility ?? "public",
        created: now,
        updated: now,
        contentHash: computeContentHash(
          parsed.content ?? request.input.markdown,
        ),
      };
      return service.createEntity({ entity });
    },
    updateEntity: async <T extends BaseEntity>(
      request: UpdateEntityRequest<T>,
    ): Promise<EntityMutationResult> => {
      const entity = request.entity;
      if (!entity.id) throw new Error("Entity must have an id");
      const { content, metadata } = store.serialize(entity);
      const contentHash = computeContentHash(content);
      // Mirror the real entity service: a byte-identical write is skipped —
      // no store, no event, no job.
      const existing = store.entities.get(entity.id);
      if (
        request.options?.expectedContentHash !== undefined &&
        existing?.contentHash !== request.options.expectedContentHash
      ) {
        return {
          entityId: entity.id,
          jobId: "",
          skipped: true,
          skipReason: "content-conflict" as const,
        };
      }
      if (
        existing?.contentHash === contentHash &&
        existing.visibility === entity.visibility &&
        JSON.stringify(existing.metadata) === JSON.stringify(metadata)
      ) {
        store.markExportIntent(
          entity.entityType,
          entity.id,
          "upsert",
          request.options?.persistenceOrigin,
        );
        return { entityId: entity.id, jobId: "", skipped: true };
      }
      store.entities.set(entity.id, {
        ...entity,
        content,
        metadata,
        contentHash,
      });
      store.markExportIntent(
        entity.entityType,
        entity.id,
        "upsert",
        request.options?.persistenceOrigin,
      );
      return { entityId: entity.id, jobId: `job-${entity.id}`, skipped: false };
    },
    foldEntity: async (request): Promise<EntityMutationResult> => {
      const { source, entity } = structuredClone({
        source: request.source,
        entity: request.entity,
      });
      const targetRevision = request.targetRevision;
      if (source.entityType !== entity.entityType || source.id === entity.id)
        throw new Error("Invalid fold pair");
      const current = (): void => {
        const from = store.entities.get(source.id);
        const into = store.entities.get(entity.id);
        if (
          from?.entityType !== source.entityType ||
          entityRevision(from) !== source.expectedRevision
        )
          throw new EntityWriteConflictError(source.entityType, source.id);
        if (
          into?.entityType !== entity.entityType ||
          entityRevision(into) !== targetRevision
        )
          throw new EntityWriteConflictError(entity.entityType, entity.id);
        if (
          from.visibility !== entity.visibility ||
          into.visibility !== entity.visibility
        )
          throw new Error("A fold cannot cross visibility scopes");
      };
      current();
      const { content, metadata } = store.serialize(entity);
      const prepared = {
        ...entity,
        content,
        metadata,
        contentHash: computeContentHash(content),
      };
      await request.options?.beforeWrite?.(prepared);
      request.options?.signal?.throwIfAborted();
      current();
      // No awaits between mutations: the double models one atomic pair.
      store.entities.set(entity.id, prepared);
      store.entities.delete(source.id);
      store.markExportIntent(
        entity.entityType,
        entity.id,
        "upsert",
        request.options?.persistenceOrigin,
      );
      store.markExportIntent(
        source.entityType,
        source.id,
        "delete",
        request.options?.persistenceOrigin,
      );
      return { entityId: entity.id, jobId: `job-${entity.id}`, skipped: false };
    },
    deleteEntity: async (request: {
      entityType: string;
      id: string;
      options?: {
        persistenceOrigin?: "ordinary" | "directory-sync";
        expectedContentHash?: string | undefined;
      };
    }): Promise<boolean> => {
      const expectedContentHash = request.options?.expectedContentHash;
      if (
        expectedContentHash !== undefined &&
        store.entities.get(request.id)?.contentHash !== expectedContentHash
      ) {
        return false;
      }
      store.entities.delete(request.id);
      store.markExportIntent(
        request.entityType,
        request.id,
        "delete",
        request.options?.persistenceOrigin,
      );
      return true;
    },
    getEntity: getEntityFake,
    listEntities: listEntitiesFake,
    search: async () => [],
    searchWithDistances: async () => [],
    nearestToEntity: async () => [],
    getEntityTypes: () => Array.from(store.types),
    hasEntityType: (type: string) => store.types.has(type),
    serializeEntity: (entity: BaseEntity) => JSON.stringify(entity),
    deserializeEntity: (markdown: string, entityType: string) =>
      store.adapters.get(entityType)?.fromMarkdown(markdown) ?? {
        content: markdown,
      },
    getAsyncJobStatus: async () => ({ status: "completed" as const }),
    upsertEntity: async <T extends BaseEntity>(
      request: UpsertEntityRequest<T>,
    ): Promise<EntityMutationResult & { created: boolean }> => {
      const entity = request.entity;
      store.types.add(entity.entityType);
      const id = entity.id || `entity-${Date.now()}`;
      const exists = store.entities.has(id);
      const { content, metadata } = store.serialize({ ...entity, id });
      store.entities.set(id, {
        ...entity,
        id,
        content,
        metadata,
        visibility: entity.visibility,
        contentHash: computeContentHash(content),
      });
      store.markExportIntent(
        entity.entityType,
        id,
        "upsert",
        request.options?.persistenceOrigin,
      );
      return {
        entityId: id,
        jobId: `job-${id}`,
        created: !exists,
        skipped: false,
      };
    },
    getEntityTypeConfig: store.typeConfig,
    isProjectionOwnedEntity: async () => false,
    releaseProjectionOwnership: async (): Promise<void> => {},
    listPendingEntityExports: async () =>
      [...store.exportIntents.values()].sort(
        (left, right) => left.markedAt - right.markedAt,
      ),
    hasPendingEntityExports: async () => store.exportIntents.size > 0,
    acknowledgeEntityExports: async (request): Promise<number> => {
      let acknowledged = 0;
      for (const intent of request.intents) {
        const key = store.exportKey(intent.entityType, intent.entityId);
        if (store.exportIntents.get(key)?.revision !== intent.revision)
          continue;
        store.exportIntents.delete(key);
        acknowledged += 1;
      }
      return acknowledged;
    },
    getWeightMap: () => ({}),
    countEntities: async (request) => filterEntitiesFake(request).length,
    getEntityCounts: async (
      visibilityScope?: BaseEntity["visibility"],
    ): Promise<Array<{ entityType: string; count: number }>> => {
      const visible = new Set(
        getVisibleContentVisibilities(visibilityScope ?? "public"),
      );
      const counts = new Map<string, number>();
      for (const entity of store.entities.values()) {
        if (!visible.has(entity.visibility)) continue;
        counts.set(entity.entityType, (counts.get(entity.entityType) ?? 0) + 1);
      }
      return Array.from(counts.entries()).map(([entityType, count]) => ({
        entityType,
        count,
      }));
    },

    // The fake stores serialized entities directly, so there is no separate
    // unresolved form to return.
    getEntityRaw: getEntityFake,
    getEntityWriteSnapshot: async (
      request,
    ): ReturnType<IEntityService["getEntityWriteSnapshot"]> => {
      const entity = await getEntityFake(request);
      return entity
        ? { entity: structuredClone(entity), revision: entityRevision(entity) }
        : null;
    },

    // Embeddings and projections are not modelled: the fake has no vectors, so
    // it reports an empty, ready index rather than pretending to search one.
    storeEmbedding: async (): Promise<void> => {},
    countEmbeddings: async (): Promise<number> => 0,
    backfillMissingEmbeddings: async () => ({ queued: 0, skipped: 0 }),
    isIndexReady: (): boolean => true,
    awaitIndexReady: async () => ({
      ready: true,
      degraded: false,
      activeEmbeddingJobs: 0,
      missingEmbeddings: 0,
      staleEmbeddings: 0,
      failedEmbeddings: 0,
      embeddableEntities: 0,
      embeddedEntities: 0,
    }),
    projectSemanticSpace: async () => ({
      origin: { kind: "centroid" as const },
      points: [],
      neighbors: [],
      distanceRange: { min: 0, max: 0 },
    }),

    reconcileProjectionTargets: async (): Promise<void> => {},
    setProjectionWakeup: () => (): void => {},
    runBulkMutation: async <TResult>(
      _input: { source: string; operationId: string },
      mutation: () => Promise<TResult>,
    ): Promise<TResult> => mutation(),
    prepareDurableBulkMutation: async (): Promise<void> => {},
    finalizeDurableBulkMutationEnqueue: async (): Promise<void> => {},
    failDurableBulkMutationEnqueue: async (): Promise<void> => {},
    runDurableBulkMutationChild: async <TResult>(
      _input: {
        source: string;
        operationId: string;
        rootJobId: string;
        childKey: string;
        expectedChildren: number;
        jobId: string;
      },
      mutation: () => Promise<TResult>,
    ): Promise<TResult> => mutation(),
    settleDurableBulkMutationChild: async () => true,
    recoverProjectionBatches: async () => ({
      fencedCallbacks: 0,
      releasedDurableRoots: 0,
    }),
    areGroupingsReady: () => true,
    ensureGroupingsReady: async () => service.areGroupingsReady(),
    reprojectRegisteredGroupings: async (): Promise<void> => {},
    // Hierarchy grouping is tested against SQLite, not duplicated in this fake.
    queryEntityHierarchy: async (): Promise<never> => {
      throw new Error(
        "createMockShell: inject an entity service for hierarchy queries",
      );
    },
    queryGroupingCatalog: async (): Promise<never> => {
      throw new Error(
        "createMockShell: inject an entity service for grouping queries",
      );
    },
    queryGroupingMembers: async (): Promise<never> => {
      throw new Error(
        "createMockShell: inject an entity service for grouping queries",
      );
    },
    queryGroupingUsage: async (): Promise<never> => {
      throw new Error(
        "createMockShell: inject an entity service for grouping queries",
      );
    },
    // Projection storage is database-backed and cannot be faked usefully. Fail
    // loudly rather than hand back an empty stand-in, which would make a test
    // asserting projection behaviour silently meaningless.
    getProjectionStore: (): never => {
      throw new Error(
        "createMockShell: getProjectionStore is not mocked; use a real entity service for projection tests",
      );
    },

    initialize: async (): Promise<void> => {},
  } satisfies IEntityService;

  return service;
}
