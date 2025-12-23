import { mock } from "bun:test";
import type { EntityService, BaseEntity } from "@brains/entity-service";

/**
 * Options for creating a mock entity service
 */
export interface MockEntityServiceOptions {
  /** Entities to return from getEntity */
  entities?: Map<string, BaseEntity>;
  /** Entity types to return from getEntityTypes */
  entityTypes?: string[];
}

/**
 * Mock entity service type with spyable methods
 */
export type MockEntityService = {
  getEntity: ReturnType<typeof mock>;
  createEntity: ReturnType<typeof mock>;
  updateEntity: ReturnType<typeof mock>;
  deleteEntity: ReturnType<typeof mock>;
  upsertEntity: ReturnType<typeof mock>;
  listEntities: ReturnType<typeof mock>;
  search: ReturnType<typeof mock>;
  getEntityTypes: ReturnType<typeof mock>;
  hasEntityType: ReturnType<typeof mock>;
  serializeEntity: ReturnType<typeof mock>;
  deserializeEntity: ReturnType<typeof mock>;
  getAsyncJobStatus: ReturnType<typeof mock>;
  getEntityCounts: ReturnType<typeof mock>;
  storeEntityWithEmbedding: ReturnType<typeof mock>;
};

/**
 * Create a mock EntityService for testing
 *
 * @example
 * ```typescript
 * const mockEntityService = createMockEntityService({
 *   entityTypes: ["note", "post"],
 * });
 *
 * // Configure specific behavior
 * mockEntityService.getEntity.mockResolvedValue({ id: "123", ... });
 *
 * // Use in context
 * const context = createMockServicePluginContext({
 *   entityService: mockEntityService,
 * });
 * ```
 */
export function createMockEntityService(
  options: MockEntityServiceOptions = {},
): MockEntityService {
  const { entities = new Map(), entityTypes = [] } = options;

  return {
    getEntity: mock((type: string, id: string) => {
      const key = `${type}:${id}`;
      return Promise.resolve(entities.get(key) ?? null);
    }),
    createEntity: mock(() =>
      Promise.resolve({ entityId: "mock-entity-id", jobId: "mock-job-id" }),
    ),
    updateEntity: mock(() =>
      Promise.resolve({ entityId: "mock-entity-id", jobId: "mock-job-id" }),
    ),
    deleteEntity: mock(() => Promise.resolve(true)),
    upsertEntity: mock(() =>
      Promise.resolve({
        entityId: "mock-entity-id",
        jobId: "mock-job-id",
        created: false,
      }),
    ),
    listEntities: mock(() => Promise.resolve([])),
    search: mock(() => Promise.resolve([])),
    getEntityTypes: mock(() => entityTypes),
    hasEntityType: mock((type: string) => entityTypes.includes(type)),
    serializeEntity: mock(() => ""),
    deserializeEntity: mock(() => ({})),
    getAsyncJobStatus: mock(() =>
      Promise.resolve({ status: "completed" as const }),
    ),
    getEntityCounts: mock(() => Promise.resolve([])),
    storeEntityWithEmbedding: mock(() => Promise.resolve()),
  };
}

/**
 * Cast MockEntityService to EntityService for type compatibility
 * Use this when passing to code that expects EntityService
 */
export function asMockEntityService(
  mockService: MockEntityService,
): EntityService {
  return mockService as unknown as EntityService;
}
