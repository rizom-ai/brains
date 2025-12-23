import { mock } from "bun:test";
import type { BaseEntity } from "@brains/entity-service";
import type { IEntityService } from "@brains/plugins";

/**
 * Return value configuration for mock entity service methods
 */
export interface MockEntityServiceReturns {
  getEntity?: BaseEntity | null;
  createEntity?: { entityId: string; jobId?: string };
  updateEntity?: { entityId: string; jobId?: string };
  deleteEntity?: boolean;
  listEntities?: BaseEntity[];
  search?: BaseEntity[];
}

/**
 * Options for creating a mock entity service
 */
export interface MockEntityServiceOptions {
  /** Entity types to return from getEntityTypes */
  entityTypes?: string[];
  /** Pre-configured return values for methods */
  returns?: MockEntityServiceReturns;
}

/**
 * Create a mock EntityService for testing
 *
 * Returns an IEntityService-typed object where all methods are bun mock functions.
 * The cast is centralized here so test files don't need `as unknown as` casts.
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
  const { entityTypes = [], returns = {} } = options;

  return {
    getEntity: mock(() => Promise.resolve(returns.getEntity ?? null)),
    createEntity: mock(() =>
      Promise.resolve(
        returns.createEntity ?? {
          entityId: "mock-entity-id",
          jobId: "mock-job-id",
        },
      ),
    ),
    updateEntity: mock(() =>
      Promise.resolve(
        returns.updateEntity ?? {
          entityId: "mock-entity-id",
          jobId: "mock-job-id",
        },
      ),
    ),
    deleteEntity: mock(() => Promise.resolve(returns.deleteEntity ?? true)),
    upsertEntity: mock(() =>
      Promise.resolve({
        entityId: "mock-entity-id",
        jobId: "mock-job-id",
        created: false,
      }),
    ),
    listEntities: mock(() => Promise.resolve(returns.listEntities ?? [])),
    search: mock(() => Promise.resolve(returns.search ?? [])),
    getEntityTypes: mock(() => entityTypes),
    hasEntityType: mock((type: string) => entityTypes.includes(type)),
    serializeEntity: mock(() => ""),
    deserializeEntity: mock(() => ({})),
    getAsyncJobStatus: mock(() =>
      Promise.resolve({ status: "completed" as const }),
    ),
    getEntityCounts: mock(() => Promise.resolve([])),
    storeEntityWithEmbedding: mock(() => Promise.resolve()),
  } as unknown as IEntityService;
}
