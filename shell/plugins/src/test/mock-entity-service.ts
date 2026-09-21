import {
  getVisibleContentVisibilities,
  normalizeContentVisibility,
  type BaseEntity,
  type CreateEntityRequest,
  type EntityMutationResult,
  type EntitySchema,
  type EntitySearchRequest,
  type GetEntityRequest,
  type IEntityService,
  type ListEntitiesRequest,
  type SearchResult,
  type UpdateEntityRequest,
  type UpsertEntityRequest,
} from "@brains/entity-service";
import { computeContentHash } from "@brains/utils/hash";
import { searchFixtureEntities } from "./entity-search";
import type { MockEntityStore } from "./mock-entity-store";

/** Stateful, materialized entity reads and writes over the registry's shared store. */
export function createMockEntityService(
  store: MockEntityStore,
): IEntityService {
  // --- Entity Service (stateful) ---
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
    const visible =
      request.visibilityScope === undefined ||
      getVisibleContentVisibilities(request.visibilityScope).includes(
        entity.visibility,
      );
    if (!visible) return null;
    return schema ? schema.parse(entity) : entity;
  }

  // Mirrors the real query layer's ORDER BY: system fields come from the
  // entity, everything else from metadata; NULLs sort smallest (SQLite),
  // and nullsFirst forces them ahead regardless of direction.
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
    for (const { field, direction, nullsFirst } of sortFields) {
      const a = sortFieldValue(left, field);
      const b = sortFieldValue(right, field);
      const aNull = a === null || a === undefined;
      const bNull = b === null || b === undefined;
      if (aNull || bNull) {
        if (aNull && bNull) continue;
        if (nullsFirst) return aNull ? -1 : 1;
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
    const scope = request.options?.filter?.visibilityScope;
    const visible = scope
      ? new Set(getVisibleContentVisibilities(scope))
      : null;
    let results = Array.from(store.entities.values()).filter(
      (e) =>
        e.entityType === request.entityType &&
        (visible === null || visible.has(e.visibility)),
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

  async function searchFake(
    request: EntitySearchRequest,
  ): Promise<SearchResult[]>;
  async function searchFake<T extends BaseEntity>(
    request: EntitySearchRequest,
    schema: EntitySchema<T>,
  ): Promise<SearchResult<T>[]>;
  async function searchFake(
    request: EntitySearchRequest,
    schema?: EntitySchema<BaseEntity>,
  ): Promise<SearchResult[]> {
    const results = searchFixtureEntities(
      [...store.entities.values()],
      request,
    );
    return schema
      ? results.map((result) => ({
          ...result,
          entity: schema.parse(result.entity),
        }))
      : results;
  }

  const service: IEntityService = {
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
      const materialized = store.materialize(entity);
      store.entities.set(id, { ...entity, ...materialized });
      store.markExportIntent(
        entity.entityType,
        id,
        "upsert",
        request.options?.persistenceOrigin,
      );
      return { entityId: id, jobId: `job-${id}`, skipped: false };
    },
    createEntityFromMarkdown: async (request: {
      input: { entityType: string; id: string; markdown: string };
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
        visibility: "public" as const,
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
      const { content, metadata, contentHash } = store.materialize(entity);
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
    deleteEntity: async (request: {
      entityType: string;
      id: string;
      options?: { persistenceOrigin?: "ordinary" | "directory-sync" };
    }): Promise<boolean> => {
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
    getEntities: async (request: {
      entityType: string;
      ids: readonly string[];
      visibilityScope?: BaseEntity["visibility"];
    }): Promise<BaseEntity[]> => {
      const visible = request.visibilityScope
        ? new Set(getVisibleContentVisibilities(request.visibilityScope))
        : null;
      return [...new Set(request.ids)].flatMap((id): BaseEntity[] => {
        const entity = store.entities.get(id);
        return entity?.entityType === request.entityType &&
          (visible === null || visible.has(entity.visibility))
          ? [entity]
          : [];
      });
    },
    listEntities: listEntitiesFake,
    search: searchFake,
    searchWithDistances: async () => [],
    getEntityTypes: () => Array.from(store.types),
    hasEntityType: (type: string) => store.types.has(type),
    serializeEntity: (entity: BaseEntity) => JSON.stringify(entity),
    deserializeEntity: (markdown: string) => ({ content: markdown }),
    getAsyncJobStatus: async () => ({ status: "completed" as const }),
    upsertEntity: async <T extends BaseEntity>(
      request: UpsertEntityRequest<T>,
    ): Promise<EntityMutationResult & { created: boolean }> => {
      const entity = request.entity;
      store.types.add(entity.entityType);
      const id = entity.id || `entity-${Date.now()}`;
      const exists = store.entities.has(id);
      const materialized = store.materialize({ ...entity, id });
      store.entities.set(id, { ...entity, id, ...materialized });
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
      const visible = visibilityScope
        ? new Set(getVisibleContentVisibilities(visibilityScope))
        : null;
      const counts = new Map<string, number>();
      for (const entity of store.entities.values()) {
        if (visible !== null && !visible.has(entity.visibility)) continue;
        counts.set(entity.entityType, (counts.get(entity.entityType) ?? 0) + 1);
      }
      return Array.from(counts.entries()).map(([entityType, count]) => ({
        entityType,
        count,
      }));
    },

    // The fake has no unresolved asset references; raw and resolved reads
    // share the materialized entity view.
    getEntityRaw: getEntityFake,
    getEntityWriteSnapshot: async (
      request,
    ): ReturnType<IEntityService["getEntityWriteSnapshot"]> => {
      const entity = await getEntityFake(request);
      return entity ? { entity, revision: "mock-revision" } : null;
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
    // Hierarchy grouping is tested against SQLite, not duplicated in this fake.
    queryEntityHierarchy: async (): Promise<never> => {
      throw new Error(
        "createMockShell: inject an entity service for hierarchy queries",
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
