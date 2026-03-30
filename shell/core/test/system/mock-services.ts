import type { SystemServices } from "../../src/system/types";
import type { createInputSchema } from "../../src/system/schemas";
import { createSilentLogger } from "@brains/test-utils";
import type { BaseEntity } from "@brains/entity-service";
import type { z } from "@brains/utils";

/**
 * Create mock SystemServices for testing system tools.
 * Stateful: entity store tracks creates/updates/deletes.
 */
export function createMockSystemServices(
  overrides: Partial<SystemServices> = {},
): SystemServices & {
  /** Access the in-memory entity store */
  getEntities: () => Map<string, BaseEntity>;
  /** Seed entities for testing */
  addEntities: (entities: BaseEntity[]) => void;
  /** Get the last job enqueued via jobs.enqueue */
  getLastEnqueuedJob: () =>
    | { type: string; data: z.infer<typeof createInputSchema> }
    | undefined;
} {
  const entities = new Map<string, BaseEntity>();
  const entityTypes = new Set<string>();

  const addEntities = (ents: BaseEntity[]): void => {
    for (const e of ents) {
      entities.set(e.id, e);
      entityTypes.add(e.entityType);
    }
  };

  const entityRegistry = {
    getAdapter: () => ({ supportsCoverImage: false }),
    hasEntityType: (type: string) => entityTypes.has(type),
    getAllEntityTypes: () => Array.from(entityTypes),
  } as unknown as SystemServices["entityRegistry"];

  const entityService = {
    search: async () => [],
    getEntity: async (type: string, id: string) => {
      const entity = entities.get(id);
      return entity?.entityType === type ? entity : null;
    },
    listEntities: async (type: string) =>
      Array.from(entities.values()).filter((e) => e.entityType === type),
    getEntityTypes: () => Array.from(entityTypes),
    hasEntityType: (type: string) => entityTypes.has(type),
    createEntity: async (entity: BaseEntity) => {
      const id = entity.id || `entity-${Date.now()}`;
      entities.set(id, { ...entity, id });
      entityTypes.add(entity.entityType);
      return { entityId: id, jobId: `job-${id}` };
    },
    updateEntity: async (entity: BaseEntity) => {
      entities.set(entity.id, entity);
      return { entityId: entity.id, jobId: `job-${entity.id}` };
    },
    deleteEntity: async (_type: string, id: string) => {
      entities.delete(id);
      return true;
    },
    getEntityCounts: async () => [],
    serializeEntity: (entity: BaseEntity) => JSON.stringify(entity),
    deserializeEntity: (md: string) => ({ content: md }) as BaseEntity,
  } as unknown as SystemServices["entityService"];

  const enqueuedJobs: Array<{
    type: string;
    data: z.infer<typeof createInputSchema>;
  }> = [];
  const jobs = {
    enqueue: async (type: string, data: unknown) => {
      enqueuedJobs.push({
        type,
        data: data as z.infer<typeof createInputSchema>,
      });
      return `job-${Date.now()}`;
    },
    enqueueBatch: async () => `batch-${Date.now()}`,
    getLastEnqueued: () => enqueuedJobs[enqueuedJobs.length - 1],
    registerHandler: () => {},
    getActiveJobs: async () => [],
    getActiveBatches: async () => [],
    getBatchStatus: async () => null,
    getStatus: async () => null,
  } as unknown as SystemServices["jobs"];

  const conversationService = {
    getConversation: async () => null,
    searchConversations: async () => [],
    getMessages: async () => [],
  } as unknown as SystemServices["conversationService"];

  const messageBus = {
    send: async () => ({ success: true }),
    subscribe: (): (() => void) => () => {},
  } as unknown as SystemServices["messageBus"];

  return {
    entityService,
    entityRegistry,
    jobs,
    conversationService,
    messageBus,
    logger: createSilentLogger("system-test"),
    query: async () => ({ message: "Mock response", summary: "Mock" }),
    getIdentity: () => ({
      name: "Test Brain",
      role: "Test",
      purpose: "Testing",
      values: ["test"],
    }),
    getProfile: () => ({ name: "Test Owner" }),
    getAppInfo: async () => ({
      model: "test",
      version: "1.0.0",
      plugins: [],
      interfaces: [],
    }),
    searchLimit: 10,
    ...overrides,
    // Test helpers
    getEntities: () => entities,
    addEntities,
    getLastEnqueuedJob: () => enqueuedJobs[enqueuedJobs.length - 1],
  };
}
