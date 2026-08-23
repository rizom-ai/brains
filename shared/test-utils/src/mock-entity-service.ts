import { mock } from "bun:test";
import type {
  BaseEntity,
  EntityMutationResult,
  SearchResult,
} from "@brains/entity-service";
import type { IEntityService } from "@brains/plugins";
import { genericSpy } from "./generic-spy";

/**
 * Return value configuration for mock entity service methods
 */
export interface MockEntityServiceReturns {
  getEntity?: BaseEntity | null;
  createEntity?: EntityMutationResult;
  updateEntity?: EntityMutationResult;
  deleteEntity?: boolean;
  listEntities?: BaseEntity[];
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

/**
 * Options for creating a mock entity service
 */
export interface MockEntityServiceOptions {
  /** Entity types to return from getEntityTypes */
  entityTypes?: string[];
  /** Pre-configured return values for methods */
  returns?: MockEntityServiceReturns;
  /** Dynamic implementation for listEntities (overrides returns.listEntities) */
  listEntitiesImpl?: (request: { entityType: string }) => Promise<BaseEntity[]>;
  /** Dynamic implementation for getEntity (overrides returns.getEntity) */
  getEntityImpl?: (request: {
    entityType: string;
    id: string;
  }) => Promise<BaseEntity | null>;
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
  } = options;

  // Recording mocks for the generic read methods. These stay real spies, so
  // `expect(...).toHaveBeenCalledWith()` keeps working; `genericSpy` only
  // restores the type parameters `mock()` erased. Every other member below is
  // fully checked by the `satisfies` at the end of this literal.
  const listEntitiesMock = mock(
    (request: { entityType: string }): Promise<BaseEntity[]> =>
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
  const searchMock = mock((): Promise<SearchResult[]> =>
    Promise.resolve(returns.search ?? []),
  );

  return {
    getEntity: genericSpy<IEntityService["getEntity"]>(getEntityMock),
    getEntityRaw: genericSpy<IEntityService["getEntityRaw"]>(getEntityRawMock),
    listEntities: genericSpy<IEntityService["listEntities"]>(listEntitiesMock),
    search: genericSpy<IEntityService["search"]>(searchMock),

    createEntity: mock(() =>
      Promise.resolve(mutationResult(returns.createEntity)),
    ),
    createEntityFromMarkdown: mock(() =>
      Promise.resolve(mutationResult(undefined)),
    ),
    updateEntity: mock(() =>
      Promise.resolve(mutationResult(returns.updateEntity)),
    ),
    deleteEntity: mock(() => Promise.resolve(returns.deleteEntity ?? true)),
    upsertEntity: mock(() =>
      Promise.resolve({ ...mutationResult(undefined), created: false }),
    ),
    getEntityTypes: mock(() => entityTypes),
    hasEntityType: mock((type: string) => entityTypes.includes(type)),
    isProjectionOwnedEntity: mock(() => Promise.resolve(false)),
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
}
