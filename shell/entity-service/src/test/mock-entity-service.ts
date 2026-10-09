import { mock } from "bun:test";
import { createTestEntity } from "./fixtures";
import type {
  BaseEntity,
  EntityMutationResult,
  EntityMutationReceipt,
  EntityWriteSnapshot,
  EntityHierarchyPage,
  QueryEntityHierarchyRequest,
  EntityGroupingCatalog,
  EntityGroupingUsage,
  EntityGroupingMembers,
  SearchResult,
  ListOptions,
  IEntityService,
} from "../index";
import { genericSpy } from "@brains/test-utils";
import {
  normalizeContentVisibility,
  type RawContentVisibility,
} from "../types";

/**
 * Return value configuration for mock entity service methods
 */
export interface MockEntityServiceReturns {
  getEntity?: BaseEntity | null;
  getEntities?: BaseEntity[];
  getEntityWriteSnapshot?: EntityWriteSnapshot | null;
  createEntity?: EntityMutationResult;
  updateEntity?: EntityMutationResult;
  deleteEntity?: boolean;
  foldEntity?: EntityMutationResult;
  getEntityMutationReceipt?: EntityMutationReceipt | null;
  applyEntityMutationOnce?: EntityMutationReceipt;
  listEntities?: BaseEntity[];
  queryEntityHierarchy?: EntityHierarchyPage;
  queryGroupingCatalog?: EntityGroupingCatalog;
  queryGroupingMembers?: EntityGroupingMembers;
  queryGroupingUsage?: EntityGroupingUsage;
  search?: SearchResult[];
  countEntities?: number;
}

const mutationResult = (
  override: EntityMutationResult | undefined,
): EntityMutationResult =>
  override ?? {
    entityId: "mock-entity-id",
    jobId: "mock-job-id",
    skipped: false,
  };

/** The fields a write guard inspects, filled in the way persistence would. */
function writtenEntity(entity: {
  entityType: string;
  id?: string | undefined;
  content?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  visibility?: RawContentVisibility | undefined;
}): BaseEntity {
  return createTestEntity(entity.entityType, {
    id: entity.id ?? "mock-entity-id",
    ...(entity.content !== undefined && { content: entity.content }),
    ...(entity.metadata && { metadata: entity.metadata }),
    ...(entity.visibility && {
      visibility: normalizeContentVisibility(entity.visibility),
    }),
  });
}

/**
 * Options for creating a mock entity service
 */
export interface MockEntityServiceOptions {
  /** Entity types to return from getEntityTypes */
  entityTypes?: string[];
  /** Pre-configured return values for methods */
  returns?: MockEntityServiceReturns;
  /** Dynamic implementation for listEntities (overrides returns.listEntities) */
  /**
   * Given the whole request, options included.
   *
   * The options used to be dropped here, which meant a rule that filtered by
   * `visibilityScope` and one that forgot to were indistinguishable to every
   * test in the repo — and one of them was deleting entities it did not own.
   */
  listEntitiesImpl?: (request: {
    entityType: string;
    options?: ListOptions | undefined;
  }) => Promise<BaseEntity[]>;
  /** Dynamic implementation for getEntity (overrides returns.getEntity) */
  getEntityImpl?: (request: {
    entityType: string;
    id: string;
  }) => Promise<BaseEntity | null>;
  /** Dynamic implementation for getEntities (overrides returns.getEntities) */
  getEntitiesImpl?: (request: {
    entityType: string;
    ids: readonly string[];
  }) => Promise<BaseEntity[]>;
  /**
   * Record what a test writes, rather than returning a canned result.
   *
   * Writes are generic too, so a test that stubs them by hand has to assert
   * the stub matches — which stops checking it. Configured here, the
   * implementation is checked and `genericSpy` carries the one erasure
   * `mock()` actually causes.
   */
  createEntityImpl?: (request: {
    entity: BaseEntity;
  }) => Promise<EntityMutationResult>;
  updateEntityImpl?: (request: {
    entity: BaseEntity;
  }) => Promise<EntityMutationResult>;
}

/**
 * Create a mock EntityService for testing
 *
 * Returns an IEntityService-typed object where all methods are bun mock
 * functions, so test files need no casts of their own. The literal is checked
 * with `satisfies IEntityService`: if the interface gains a method or changes
 * a signature, this file fails to compile rather than going silently stale.
 *
 * @example
 * ```typescript
 * // Simple usage with defaults
 * const mockEntityService = createMockEntityService();
 *
 * // With pre-configured return values (no casts needed!)
 * const mockEntityService = createMockEntityService({
 *   entityTypes: ["note", "post"],
 *   returns: {
 *     getEntity: { id: "123", entityType: "note", ... },
 *     deleteEntity: true,
 *     listEntities: [entity1, entity2],
 *   }
 * });
 *
 * // Pass directly to constructors expecting IEntityService
 * const datasource = new MyDataSource(mockEntityService, logger);
 * ```
 */
export function createMockEntityService(
  options: MockEntityServiceOptions = {},
): IEntityService {
  const {
    entityTypes = [],
    returns = {},
    listEntitiesImpl,
    getEntityImpl,
    getEntitiesImpl,
    createEntityImpl,
    updateEntityImpl,
  } = options;

  // Recording mocks for the generic read methods. These stay real spies, so
  // `expect(...).toHaveBeenCalledWith()` keeps working; `genericSpy` only
  // restores the type parameters `mock()` erased. Every other member below is
  // fully checked by the `satisfies` at the end of this literal.
  const listEntitiesMock = mock(
    (request: {
      entityType: string;
      options?: ListOptions | undefined;
    }): Promise<BaseEntity[]> =>
      listEntitiesImpl?.(request) ??
      Promise.resolve(returns.listEntities ?? []),
  );
  const getEntityMock = mock(
    (request: { entityType: string; id: string }): Promise<BaseEntity | null> =>
      getEntityImpl?.(request) ?? Promise.resolve(returns.getEntity ?? null),
  );
  const getEntityRawMock = mock(
    (request: { entityType: string; id: string }): Promise<BaseEntity | null> =>
      getEntityImpl?.(request) ?? Promise.resolve(returns.getEntity ?? null),
  );
  const getEntitiesMock = mock(
    (request: {
      entityType: string;
      ids: readonly string[];
    }): Promise<BaseEntity[]> =>
      getEntitiesImpl?.(request) ??
      Promise.resolve(
        returns.getEntities ?? (returns.getEntity ? [returns.getEntity] : []),
      ),
  );
  const searchMock = mock((): Promise<SearchResult[]> =>
    Promise.resolve(returns.search ?? []),
  );

  const service: IEntityService = {
    getEntityMutationReceipt: mock(
      async () => returns.getEntityMutationReceipt ?? null,
    ),
    applyEntityMutationOnce: mock(async () => {
      if (!returns.applyEntityMutationOnce)
        throw new Error("Configure the mutation receipt result on this stub");
      return returns.applyEntityMutationOnce;
    }),
    getEntityWriteSnapshot: mock(
      async () => returns.getEntityWriteSnapshot ?? null,
    ),
    areGroupingsReady: mock(() => true),
    ensureGroupingsReady: mock(async () => service.areGroupingsReady()),
    reprojectRegisteredGroupings: mock(async () => {}),
    getEntity: genericSpy<IEntityService["getEntity"]>(getEntityMock),
    getEntities: getEntitiesMock,
    getEntityRaw: genericSpy<IEntityService["getEntityRaw"]>(getEntityRawMock),
    listEntities: genericSpy<IEntityService["listEntities"]>(listEntitiesMock),
    queryEntityHierarchy: mock(
      async (
        request: QueryEntityHierarchyRequest,
      ): Promise<EntityHierarchyPage> =>
        returns.queryEntityHierarchy ?? {
          prefix: request.prefix ? [...request.prefix] : null,
          folders: [],
          entities: [],
          offset: request.offset ?? 0,
          totalEntities: 0,
        },
    ),
    queryGroupingCatalog: mock(
      async () => returns.queryGroupingCatalog ?? { values: [], total: 0 },
    ),
    queryGroupingMembers: mock(
      async () => returns.queryGroupingMembers ?? { entities: [], total: 0 },
    ),
    queryGroupingUsage: mock(
      async () => returns.queryGroupingUsage ?? { entries: 0, values: [] },
    ),
    search: genericSpy<IEntityService["search"]>(searchMock),

    // Guards must run before a configured write records its side effects.
    createEntity: genericSpy<IEntityService["createEntity"]>(
      mock(async (request: Parameters<IEntityService["createEntity"]>[0]) => {
        const entity = writtenEntity(request.entity);
        await request.options?.beforeWrite?.(entity);
        return (
          createEntityImpl?.({ entity }) ?? mutationResult(returns.createEntity)
        );
      }),
    ),
    createEntityFromMarkdown: mock(() =>
      Promise.resolve(mutationResult(undefined)),
    ),
    updateEntity: genericSpy<IEntityService["updateEntity"]>(
      mock(async (request: Parameters<IEntityService["updateEntity"]>[0]) => {
        const entity = writtenEntity(request.entity);
        await request.options?.beforeWrite?.(entity);
        return (
          updateEntityImpl?.({ entity }) ?? mutationResult(returns.updateEntity)
        );
      }),
    ),
    deleteEntity: mock(async (request) => {
      request.options?.signal?.throwIfAborted();
      if (request.options?.conditionalWrite || request.options?.beforeWrite)
        throw new Error(
          "Conditional deletion requires a stateful entity fixture",
        );
      return returns.deleteEntity ?? true;
    }),
    foldEntity: mock(async (request) => {
      await request.options?.beforeWrite?.(request.entity);
      return mutationResult(returns.foldEntity);
    }),
    upsertEntity: mock(() =>
      Promise.resolve({ ...mutationResult(undefined), created: false }),
    ),
    getEntityTypes: mock(() => entityTypes),
    hasEntityType: mock((type: string) => entityTypes.includes(type)),
    isProjectionOwnedEntity: mock(() => Promise.resolve(false)),
    releaseProjectionOwnership: mock(() => Promise.resolve()),
    listPendingEntityExports: mock(() => Promise.resolve([])),
    hasPendingEntityExports: mock(() => Promise.resolve(false)),
    acknowledgeEntityExports: mock(() => Promise.resolve(0)),
    getEntityTypeConfig: mock(() => ({})),
    getWeightMap: mock(() => ({})),
    serializeEntity: mock(() => ""),
    deserializeEntity: mock(() => ({})),
    getAsyncJobStatus: mock(() =>
      Promise.resolve({ status: "completed" as const }),
    ),
    countEntities: mock(() => Promise.resolve(returns.countEntities ?? 0)),
    getEntityCounts: mock(() => Promise.resolve([])),
    countEmbeddings: mock(() => Promise.resolve(0)),
    storeEmbedding: mock(() => Promise.resolve()),
    searchWithDistances: mock(() => Promise.resolve([])),
    nearestToEntity: mock(() => Promise.resolve([])),
    projectSemanticSpace: mock(() =>
      Promise.resolve({
        origin: { kind: "centroid" as const },
        points: [],
        neighbors: [],
        distanceRange: { min: 0, max: 0 },
      }),
    ),
    reconcileProjectionTargets: mock(() => Promise.resolve()),
    backfillMissingEmbeddings: mock(() =>
      Promise.resolve({ queued: 0, skipped: 0 }),
    ),
    isIndexReady: mock(() => true),
    awaitIndexReady: mock(() =>
      Promise.resolve({
        ready: true,
        degraded: false,
        activeEmbeddingJobs: 0,
        missingEmbeddings: 0,
        staleEmbeddings: 0,
        failedEmbeddings: 0,
        embeddableEntities: 0,
        embeddedEntities: 0,
      }),
    ),
    setProjectionWakeup: mock(() => () => {}),
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
    // Projection storage is database-backed and cannot be faked usefully.
    // Fail loudly rather than hand back an empty stand-in that would make a
    // test asserting projection behaviour silently meaningless.
    getProjectionStore: (): never => {
      throw new Error(
        "createMockEntityService: getProjectionStore is not mocked; use a real entity service for projection tests",
      );
    },
    initialize: mock(() => Promise.resolve()),
  } satisfies IEntityService;
  return service;
}
