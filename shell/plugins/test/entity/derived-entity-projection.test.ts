import { describe, expect, it, mock } from "bun:test";
import { isVisibleWithinScope } from "../../src";
import type { BaseEntity, EntityPluginContext } from "../../src";
import {
  hasPersistedTargets,
  reconcileDerivedEntities,
  registerDerivedEntityProjection,
} from "../../src/entity/derived-entity-projection";
import { createMockShell, createSilentLogger } from "@brains/test-utils";
import { createEntityPluginContext } from "../../src/entity/context";

interface CapturedListRequest {
  entityType: string;
  options?: {
    limit?: number;
    filter?: {
      visibilityScope?: BaseEntity["visibility"];
    };
  };
}

interface CapturedDeleteRequest {
  entityType: string;
  id: string;
}

interface CapturedMutationEntity {
  id: string | undefined;
  visibility: BaseEntity["visibility"] | "private" | undefined;
}

interface ProjectionContext extends EntityPluginContext {
  captured: {
    listEntities: CapturedListRequest[];
    createdEntities: CapturedMutationEntity[];
    updatedEntities: CapturedMutationEntity[];
    deletedEntities: CapturedDeleteRequest[];
  };
}

function createProjectionContext(options?: {
  listEntities?: Record<string, BaseEntity[]>;
}): ProjectionContext {
  const logger = createSilentLogger("projection-test");
  const shell = createMockShell({ logger });
  const baseContext = createEntityPluginContext(shell, "projection-test");
  const listEntities = options?.listEntities ?? {};
  shell.addEntities(Object.values(listEntities).flat());
  const captured: ProjectionContext["captured"] = {
    listEntities: [],
    createdEntities: [],
    updatedEntities: [],
    deletedEntities: [],
  };

  const listEntitiesForContext: EntityPluginContext["entityService"]["listEntities"] =
    async <T extends BaseEntity>(request: CapturedListRequest) => {
      captured.listEntities.push(request);
      const results = await baseContext.entityService.listEntities<T>(request);
      const visibilityScope = request.options?.filter?.visibilityScope;
      if (!visibilityScope) return results;
      return results.filter((entity) =>
        isVisibleWithinScope(entity.visibility, visibilityScope),
      );
    };

  const createEntityForContext: EntityPluginContext["entityService"]["createEntity"] =
    async (request) => {
      captured.createdEntities.push({
        id: request.entity.id,
        visibility: request.entity.visibility,
      });
      return baseContext.entityService.createEntity(request);
    };

  const updateEntityForContext: EntityPluginContext["entityService"]["updateEntity"] =
    async (request) => {
      captured.updatedEntities.push({
        id: request.entity.id,
        visibility: request.entity.visibility,
      });
      return baseContext.entityService.updateEntity(request);
    };

  const deleteEntityForContext: EntityPluginContext["entityService"]["deleteEntity"] =
    async (request) => {
      captured.deletedEntities.push(request);
      return baseContext.entityService.deleteEntity(request);
    };

  return {
    ...baseContext,
    entityService: {
      ...baseContext.entityService,
      listEntities: listEntitiesForContext,
      createEntity: createEntityForContext,
      updateEntity: updateEntityForContext,
      deleteEntity: deleteEntityForContext,
      getEntityTypes: mock(() => Object.keys(listEntities)),
    },
    jobs: {
      ...baseContext.jobs,
      enqueue: mock(() => Promise.resolve("job-id")),
      enqueueBatch: mock(() => Promise.resolve("batch-id")),
      registerHandler: mock(() => {}),
    },
    captured,
  };
}

async function sendMessage(
  context: EntityPluginContext,
  type: string,
  payload: unknown,
): Promise<void> {
  await context.messaging.send({ type, payload });
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
    visibility: "public",
    metadata,
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
  };
}

function parseReasonData(data: unknown): { reason: string } | null {
  if (typeof data !== "object" || data === null) return null;
  if (!("reason" in data) || typeof data.reason !== "string") return null;
  return { reason: data.reason };
}

function getConversationId(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  if (!("conversationId" in payload)) return undefined;
  return typeof payload.conversationId === "string"
    ? payload.conversationId
    : undefined;
}

function getMetadataName(entity: BaseEntity): string | undefined {
  const name = entity.metadata["name"];
  return typeof name === "string" ? name : undefined;
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
            validateAndParse: parseReasonData,
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

    await sendMessage(context, "sync:initial:completed", {});
    await sendMessage(context, "sync:initial:completed", {});

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

    await sendMessage(context, "sync:initial:completed", {});

    expect(context.captured.listEntities).toContainEqual({
      entityType: "derived",
      options: { filter: { visibilityScope: "public" } },
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

    await sendMessage(context, "entity:updated", {
      entityType: "source",
      entityId: "a",
    });
    expect(context.jobs.enqueue).not.toHaveBeenCalled();

    await sendMessage(context, "sync:initial:completed", {});

    await sendMessage(context, "entity:updated", {
      entityType: "other",
      entityId: "x",
    });
    await sendMessage(context, "entity:updated", {
      entityType: "source",
      entityId: "a",
    });

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
            conversationId: getConversationId(payload),
          }),
        },
      },
    );

    await sendMessage(context, "conversation:messageAdded", {
      conversationId: "conv-1",
    });

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
        getMetadataName(existing) === desired.name,
      deleteStale: true,
      concurrency: 1,
    });

    expect(result).toEqual({
      created: 1,
      updated: 1,
      deleted: 1,
      skipped: 1,
    });
    expect(context.captured.deletedEntities).toContainEqual({
      entityType: "derived",
      id: "stale",
    });
    expect(context.captured.updatedEntities).toHaveLength(1);
    expect(context.captured.createdEntities).toHaveLength(1);
  });

  it("looks up existing targets at the declared outputVisibility scope", async () => {
    const context = createProjectionContext({
      listEntities: {
        derived: [{ ...entity("shared-target"), visibility: "shared" }],
      },
    });

    await reconcileDerivedEntities({
      context,
      targetType: "derived",
      desired: [{ id: "shared-target", name: "still-here" }],
      getId: (item) => item.id,
      toEntityInput: (item, id) => ({
        id,
        entityType: "derived",
        content: `content:${id}`,
        metadata: { name: item.name },
      }),
      equals: () => false,
      deleteStale: true,
      outputVisibility: "shared",
      concurrency: 1,
    });

    expect(context.captured.listEntities).toContainEqual({
      entityType: "derived",
      options: { filter: { visibilityScope: "shared" } },
    });
  });

  it("defaults to public scope when no outputVisibility is declared", async () => {
    const context = createProjectionContext({
      listEntities: { derived: [] },
    });

    await reconcileDerivedEntities({
      context,
      targetType: "derived",
      desired: [],
      getId: (item: { id: string }) => item.id,
      toEntityInput: (_item, id) => ({
        id,
        entityType: "derived",
        content: "",
        metadata: {},
      }),
      concurrency: 1,
    });

    expect(context.captured.listEntities).toContainEqual({
      entityType: "derived",
      options: { filter: { visibilityScope: "public" } },
    });
  });

  it("stamps outputVisibility on every created entity", async () => {
    const context = createProjectionContext({ listEntities: { derived: [] } });

    await reconcileDerivedEntities({
      context,
      targetType: "derived",
      desired: [{ id: "new-target", name: "fresh" }],
      getId: (item) => item.id,
      toEntityInput: (item, id) => ({
        id,
        entityType: "derived",
        content: `content:${id}`,
        metadata: { name: item.name },
      }),
      outputVisibility: "shared",
      concurrency: 1,
    });

    expect(context.captured.createdEntities).toContainEqual({
      id: "new-target",
      visibility: "shared",
    });
  });

  it("stamps outputVisibility on every updated entity", async () => {
    const context = createProjectionContext({
      listEntities: {
        derived: [{ ...entity("existing"), visibility: "shared" }],
      },
    });

    await reconcileDerivedEntities({
      context,
      targetType: "derived",
      desired: [{ id: "existing", name: "updated" }],
      getId: (item) => item.id,
      toEntityInput: (item, id) => ({
        id,
        entityType: "derived",
        content: `content:${id}`,
        metadata: { name: item.name },
      }),
      equals: () => false,
      outputVisibility: "shared",
      concurrency: 1,
    });

    expect(context.captured.updatedEntities).toContainEqual({
      id: "existing",
      visibility: "shared",
    });
  });

  it("overrides any visibility that toEntityInput tried to set", async () => {
    const context = createProjectionContext({ listEntities: { derived: [] } });

    await reconcileDerivedEntities({
      context,
      targetType: "derived",
      desired: [{ id: "tries-to-be-public" }],
      getId: (item) => item.id,
      toEntityInput: (_item, id) => ({
        id,
        entityType: "derived",
        content: "",
        metadata: {},
        visibility: "public",
      }),
      outputVisibility: "restricted",
      concurrency: 1,
    });

    expect(context.captured.createdEntities).toContainEqual({
      id: "tries-to-be-public",
      visibility: "restricted",
    });
  });

  it("does not claim or delete public targets when outputVisibility is shared", async () => {
    const context = createProjectionContext({
      listEntities: {
        derived: [
          { ...entity("public-target"), visibility: "public" },
          { ...entity("shared-target"), visibility: "shared" },
        ],
      },
    });

    await reconcileDerivedEntities({
      context,
      targetType: "derived",
      desired: [{ id: "shared-target", name: "still-here" }],
      getId: (item) => item.id,
      toEntityInput: (item, id) => ({
        id,
        entityType: "derived",
        content: `content:${id}`,
        metadata: { name: item.name },
      }),
      equals: () => false,
      deleteStale: true,
      outputVisibility: "shared",
      concurrency: 1,
    });

    expect(context.captured.deletedEntities).toEqual([]);
  });

  it("treats a public target at the same id as a different partition", async () => {
    const context = createProjectionContext({
      listEntities: {
        derived: [{ ...entity("collide"), visibility: "public" }],
      },
    });

    await reconcileDerivedEntities({
      context,
      targetType: "derived",
      desired: [{ id: "collide", name: "shared-version" }],
      getId: (item) => item.id,
      toEntityInput: (item, id) => ({
        id,
        entityType: "derived",
        content: `content:${id}`,
        metadata: { name: item.name },
      }),
      equals: () => false,
      deleteStale: true,
      outputVisibility: "shared",
      concurrency: 1,
    });

    expect(context.captured.updatedEntities).toEqual([]);
    expect(context.captured.deletedEntities).toEqual([]);
    expect(context.captured.createdEntities).toContainEqual({
      id: "collide",
      visibility: "shared",
    });
  });

  it("hasPersistedTargets at outputVisibility=shared ignores public-only targets", async () => {
    const context = createProjectionContext({
      listEntities: {
        derived: [{ ...entity("public-only"), visibility: "public" }],
      },
    });

    const result = await hasPersistedTargets(context, "derived", {
      outputVisibility: "shared",
    });

    expect(result).toBe(false);
  });

  it("hasPersistedTargets uses the declared outputVisibility scope", async () => {
    const context = createProjectionContext({
      listEntities: {
        derived: [{ ...entity("restricted-target"), visibility: "restricted" }],
      },
    });

    const result = await hasPersistedTargets(context, "derived", {
      outputVisibility: "restricted",
    });

    expect(result).toBe(true);
    expect(context.captured.listEntities).toContainEqual({
      entityType: "derived",
      options: { filter: { visibilityScope: "restricted" } },
    });
  });
});
