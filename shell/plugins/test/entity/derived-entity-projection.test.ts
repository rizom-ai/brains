import { describe, expect, it, mock } from "bun:test";
import type { BaseEntity, EntityPluginContext } from "../../src";
import {
  hasPersistedTargets,
  reconcileDerivedEntities,
  registerDerivedEntityProjection,
} from "../../src/entity/derived-entity-projection";
import { createSilentLogger } from "@brains/test-utils";

type Handler = (message: { payload: unknown }) => Promise<{ success: boolean }>;

function createProjectionContext(options?: {
  listEntities?: Record<string, BaseEntity[]>;
}): EntityPluginContext & { handlers: Map<string, Handler[]> } {
  const handlers = new Map<string, Handler[]>();
  const listEntities = options?.listEntities ?? {};

  return {
    pluginId: "projection-test",
    logger: createSilentLogger("projection-test"),
    dataDir: "/tmp/projection-test",
    domain: undefined,
    siteUrl: undefined,
    previewUrl: undefined,
    entityDisplay: undefined,
    appInfo: mock(() =>
      Promise.resolve({
        version: "0.0.0",
        model: "test-model",
        uptime: 0,
        entities: 0,
        embeddings: 0,
        ai: {
          model: "test-model",
          embeddingModel: "test-embedding-model",
        },
        daemons: [],
        endpoints: [],
        interactions: [],
      }),
    ),
    entityService: {
      listEntities: mock((request: { entityType: string }) =>
        Promise.resolve(listEntities[request.entityType] ?? []),
      ),
      createEntity: mock(() => Promise.resolve({ entityId: "created" })),
      updateEntity: mock(() => Promise.resolve({ entityId: "updated" })),
      deleteEntity: mock(() => Promise.resolve(true)),
      getEntityTypes: mock(() => Object.keys(listEntities)),
    },
    entities: {
      register: mock(() => {}),
      getAdapter: mock(() => undefined),
      extendFrontmatterSchema: mock(() => {}),
      getEffectiveFrontmatterSchema: mock(() => undefined),
      update: mock(() => Promise.resolve({ entityId: "id", jobId: "job" })),
      registerDataSource: mock(() => {}),
      registerCreateInterceptor: mock(() => {}),
    },
    ai: {
      query: mock(() => Promise.resolve({ message: "" })),
      generate: mock(() => Promise.resolve({})),
      generateObject: mock(() => Promise.resolve({ object: {} })),
      generateImage: mock(() =>
        Promise.resolve({ base64: "", dataUrl: "data:image/png;base64," }),
      ),
      canGenerateImages: mock(() => false),
    },
    prompts: {
      resolve: mock((_target: string, fallback: string) =>
        Promise.resolve(fallback),
      ),
    },
    identity: {
      get: mock(() => ({ name: "Test", values: [] })),
      getProfile: mock(() => ({ name: "Test", role: "", purpose: "" })),
      getAppInfo: mock(() =>
        Promise.resolve({ version: "0.0.0", plugins: [] }),
      ),
    },
    messaging: {
      send: mock(() => Promise.resolve(undefined)),
      subscribe: mock((channel: string, handler: Handler) => {
        const existing = handlers.get(channel) ?? [];
        existing.push(handler);
        handlers.set(channel, existing);
        return () => {};
      }),
    },
    jobs: {
      enqueue: mock(() => Promise.resolve("job-id")),
      enqueueBatch: mock(() => Promise.resolve("batch-id")),
      registerHandler: mock(() => {}),
      getStatus: mock(() => Promise.resolve(null)),
      getActiveJobs: mock(() => Promise.resolve([])),
      getActiveBatches: mock(() => Promise.resolve([])),
      getBatchStatus: mock(() => Promise.resolve(null)),
    },
    conversations: {
      get: mock(() => Promise.resolve(null)),
      search: mock(() => Promise.resolve([])),
      list: mock(() => Promise.resolve([])),
      getMessages: mock(() => Promise.resolve([])),
      countMessages: mock(() => Promise.resolve(0)),
    },
    eval: { registerHandler: mock(() => {}) },
    insights: { register: mock(() => {}) },
    endpoints: { register: mock(() => {}) },
    handlers,
  } as unknown as EntityPluginContext & { handlers: Map<string, Handler[]> };
}

function entity(
  id: string,
  metadata: Record<string, unknown> = {},
): BaseEntity {
  return {
    id,
    entityType: "derived",
    content: `content:${id}`,
    contentHash: `hash:${id}`,
    metadata,
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
  };
}

describe("derived entity projections", () => {
  it("registers a job handler and queues initial sync once instead of running inline", async () => {
    const context = createProjectionContext();
    const process = mock(() => Promise.resolve({ ok: true }));

    const controller = registerDerivedEntityProjection(
      context,
      createSilentLogger("projection-test"),
      {
        id: "test-projection",
        targetType: "derived",
        job: {
          type: "derive",
          handler: {
            process,
            validateAndParse: (data) => data as { reason: string },
          },
        },
        initialSync: {
          shouldEnqueue: () => true,
          jobData: { reason: "initial-sync" },
          jobOptions: {
            source: "projection-test",
            deduplication: "coalesce",
            deduplicationKey: "test-projection:initial-sync",
            metadata: { operationType: "data_processing" },
          },
        },
      },
    );

    expect(context.jobs.registerHandler).toHaveBeenCalledTimes(1);
    expect(context.jobs.registerHandler).toHaveBeenCalledWith(
      "derive",
      expect.any(Object),
    );

    const handler = context.handlers.get("sync:initial:completed")?.[0];
    expect(handler).toBeDefined();

    await handler?.({ payload: {} });
    await handler?.({ payload: {} });

    expect(controller.hasObservedInitialSync()).toBe(true);
    expect(controller.hasQueuedInitialSync()).toBe(true);
    expect(process).not.toHaveBeenCalled();
    expect(context.jobs.enqueue).toHaveBeenCalledTimes(1);
    expect(context.jobs.enqueue).toHaveBeenCalledWith({
      type: "derive",
      data: { reason: "initial-sync" },
      options: {
        source: "projection-test",
        deduplication: "coalesce",
        deduplicationKey: "test-projection:initial-sync",
        metadata: { operationType: "data_processing" },
      },
    });
  });

  it("uses persisted targets as a durable initial sync gate", async () => {
    const context = createProjectionContext({
      listEntities: { derived: [entity("existing")] },
    });

    registerDerivedEntityProjection(
      context,
      createSilentLogger("projection-test"),
      {
        id: "test-projection",
        targetType: "derived",
        job: {
          type: "derive",
          handler: {
            process: mock(() => Promise.resolve({ ok: true })),
            validateAndParse: (data) => data,
          },
        },
        initialSync: {
          shouldEnqueue: async () =>
            !(await hasPersistedTargets(context, "derived")),
          jobData: { reason: "initial-sync" },
        },
      },
    );

    const handler = context.handlers.get("sync:initial:completed")?.[0];
    await handler?.({ payload: {} });

    expect(context.entityService.listEntities).toHaveBeenCalledWith({
      entityType: "derived",
      options: { limit: 1 },
    });
    expect(context.jobs.enqueue).not.toHaveBeenCalled();
  });

  it("queues source change projection jobs only after initial sync", async () => {
    const context = createProjectionContext();

    registerDerivedEntityProjection(
      context,
      createSilentLogger("projection-test"),
      {
        id: "test-projection",
        targetType: "derived",
        job: {
          type: "derive",
          handler: {
            process: mock(() => Promise.resolve({ ok: true })),
            validateAndParse: (data) => data,
          },
        },
        initialSync: {
          shouldEnqueue: () => false,
          jobData: { reason: "initial-sync" },
        },
        sourceChange: {
          sourceTypes: ["source"],
          requireInitialSync: true,
          jobData: (payload) => ({
            reason: "source-change",
            sourceId: payload.entityId,
          }),
          jobOptions: (payload) => ({
            source: "projection-test",
            deduplication: "coalesce",
            deduplicationKey: `test-projection:${payload.entityType}:${payload.entityId}`,
            metadata: { operationType: "data_processing" },
          }),
        },
      },
    );

    const changeHandler = context.handlers.get("entity:updated")?.[0];
    expect(changeHandler).toBeDefined();

    await changeHandler?.({ payload: { entityType: "source", entityId: "a" } });
    expect(context.jobs.enqueue).not.toHaveBeenCalled();

    const initialHandler = context.handlers.get("sync:initial:completed")?.[0];
    await initialHandler?.({ payload: {} });

    await changeHandler?.({ payload: { entityType: "other", entityId: "x" } });
    await changeHandler?.({ payload: { entityType: "source", entityId: "a" } });

    expect(context.jobs.enqueue).toHaveBeenCalledTimes(1);
    expect(context.jobs.enqueue).toHaveBeenCalledWith({
      type: "derive",
      data: { reason: "source-change", sourceId: "a" },
      options: {
        source: "projection-test",
        deduplication: "coalesce",
        deduplicationKey: "test-projection:source:a",
        metadata: { operationType: "data_processing" },
      },
    });
  });

  it("queues source change jobs for non-entity source events", async () => {
    const context = createProjectionContext();

    registerDerivedEntityProjection(
      context,
      createSilentLogger("projection-test"),
      {
        id: "conversation-projection",
        targetType: "summary",
        job: {
          type: "summary:project",
          handler: {
            process: mock(() => Promise.resolve({ ok: true })),
            validateAndParse: (data) => data,
          },
        },
        sourceChange: {
          sourceKind: "conversation",
          sourceTypes: ["conversation"],
          events: ["conversation:messageAdded"],
          jobData: (payload) => ({
            reason: "message-added",
            conversationId: (payload as { conversationId?: string })
              .conversationId,
          }),
        },
      },
    );

    const handler = context.handlers.get("conversation:messageAdded")?.[0];
    expect(handler).toBeDefined();

    await handler?.({ payload: { conversationId: "conv-1" } });

    expect(context.jobs.enqueue).toHaveBeenCalledWith({
      type: "summary:project",
      data: { reason: "message-added", conversationId: "conv-1" },
    });
  });

  it("reconciles desired state by stable id with bounded stale deletion", async () => {
    const context = createProjectionContext({
      listEntities: {
        derived: [
          entity("unchanged", { name: "same" }),
          entity("changed", { name: "old" }),
          entity("stale", { name: "stale" }),
        ],
      },
    });

    const result = await reconcileDerivedEntities({
      context,
      targetType: "derived",
      desired: [
        { id: "unchanged", name: "same" },
        { id: "changed", name: "new" },
        { id: "new", name: "new" },
      ],
      getId: (item) => item.id,
      toEntityInput: (item, id) => ({
        id,
        entityType: "derived",
        content: `content:${id}`,
        metadata: { name: item.name },
      }),
      equals: (existing, desired) =>
        existing.content === `content:${desired.id}` &&
        (existing.metadata as { name?: string }).name === desired.name,
      deleteStale: true,
      concurrency: 1,
    });

    expect(result).toEqual({
      created: 1,
      updated: 1,
      deleted: 1,
      skipped: 1,
    });
    expect(context.entityService.deleteEntity).toHaveBeenCalledWith({
      entityType: "derived",
      id: "stale",
    });
    expect(context.entityService.updateEntity).toHaveBeenCalledTimes(1);
    expect(context.entityService.createEntity).toHaveBeenCalledTimes(1);
  });
});
