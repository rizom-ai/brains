import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import assert from "node:assert/strict";
import { z } from "@brains/utils/zod";
import { LocalDatabaseRpcClient } from "@brains/core";
import { createServicePluginContext } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import {
  createEditorRoutes,
  StudioWorkspaceRegistry,
} from "@brains/studio/test";
import {
  baseEntitySchema,
  EntityRegistry,
  EntityService,
  EntityValidationError,
  isEntityValidationError,
  ENTITY_RPC_SERVICE,
} from "@brains/entity-service";
import { createTestEntityAdapter } from "@brains/entity-service/test";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createMockJobQueueService } from "@brains/job-queue/test";
import { createSilentLogger, createTestDatabase } from "@brains/test-utils";
import {
  startEntityOwnerEndpoint,
  type EntityOwnerEndpoint,
  type EntityOwnerConnection,
} from "./helpers/entity-owner-endpoint";

const logger = createSilentLogger();
const embeddingService = {
  dimensions: 3,
  generateEmbedding: async (): Promise<never> => {
    throw new Error("Unexpected embedding");
  },
  generateEmbeddings: async (): Promise<never> => {
    throw new Error("Unexpected embedding");
  },
};
function registry(): EntityRegistry {
  const value = EntityRegistry.createFresh(logger);
  value.registerEntityType(
    "note",
    baseEntitySchema,
    createTestEntityAdapter("note"),
  );
  value.registerGrouping({
    key: "areas",
    label: "Areas",
    field: "areas",
    types: ["note"],
  });
  return value;
}
let owner: EntityService;
let ownerRegistry: EntityRegistry;
let endpoint: EntityOwnerEndpoint;
let first: EntityOwnerConnection;
let second: EntityOwnerConnection;
const retire: Array<() => Promise<void>> = [];

beforeEach(async () => {
  const database = await createTestDatabase({
    prefix: "entity-wire-",
    filename: "entities.db",
    migrate: (url) => migrateEntities({ url }, logger),
  });
  retire.push(database.cleanup);
  ownerRegistry = registry();
  owner = EntityService.createFresh({
    dbConfig: { url: database.url },
    entityRegistry: ownerRegistry,
    jobQueueService: createMockJobQueueService(),
    embeddingsEnabled: false,
    embeddingService,
    logger,
  });
  const ownedService = owner;
  retire.push(() => ownedService.closeAsync());
  await owner.initialize();
  await owner.reprojectRegisteredGroupings();
  endpoint = await startEntityOwnerEndpoint(owner);
  retire.push(endpoint.close);
  const connect = (): Promise<EntityOwnerConnection> =>
    endpoint.connect({
      entityRegistry: registry(),
      jobQueueService: createMockJobQueueService(),
      embeddingService,
      logger,
    });
  first = await connect();
  second = await connect();
});
afterEach(async () => {
  for (const close of retire.splice(0).reverse()) await close();
});

function entity(
  id: string,
  visibility: "shared" | "restricted" = "shared",
): {
  id: string;
  entityType: string;
  content: string;
  metadata: Record<string, never>;
  visibility: "shared" | "restricted";
} {
  return {
    id,
    entityType: "note",
    content: "---\nareas: [Research]\n---\n\nBody",
    metadata: {},
    visibility,
  };
}

test("authenticated borrowers share owner grouping, hierarchy and write snapshots", async () => {
  await first.service.createEntity({ entity: entity("folder:shared") });
  await second.service.createEntity({
    entity: entity("folder:private", "restricted"),
  });
  expect(first.service.areGroupingsReady()).toBe(false);
  expect(await first.service.ensureGroupingsReady()).toBe(true);
  const grouping = {
    grouping: "areas",
    entityTypes: ["note"],
    visibilityScope: "shared" as const,
  };
  expect(await first.service.queryGroupingCatalog(grouping)).toEqual(
    await owner.queryGroupingCatalog(grouping),
  );
  expect(
    (
      await first.service.queryGroupingMembers({
        ...grouping,
        value: "Research",
      })
    ).total,
  ).toBe(1);
  expect(
    await second.service.queryGroupingUsage({
      ...grouping,
      values: ["Research", "Unused"],
    }),
  ).toEqual({
    entries: 1,
    values: [
      { value: "Research", count: 1 },
      { value: "Unused", count: 0 },
    ],
  });
  const hierarchyRequest = {
    entityType: "note",
    prefix: ["folder"] as const,
    visibilityScope: "shared" as const,
  };
  const hierarchy = await first.service.queryEntityHierarchy(hierarchyRequest);
  expect(hierarchy).toEqual(await owner.queryEntityHierarchy(hierarchyRequest));
  expect(hierarchy.entities.map((entry) => entry.path)).toEqual([
    ["folder", "shared"],
  ]);
  const visible = {
    entityType: "note",
    id: "folder:shared",
    visibilityScope: "shared" as const,
  };
  expect(await second.service.getEntityWriteSnapshot(visible)).toEqual(
    await owner.getEntityWriteSnapshot(visible),
  );
  expect(
    await second.service.getEntityWriteSnapshot({
      entityType: "note",
      id: "folder:private",
    }),
  ).toBeNull();
  await assert.rejects(
    first.service.reprojectRegisteredGroupings(),
    /requires the database owner/,
  );
});

test("conditional contenders preserve conflict identity over the actual error codec", async () => {
  const request = {
    entityType: "note",
    id: "contended",
    visibilityScope: "shared" as const,
  };
  await first.service.createEntity({
    entity: entity(request.id),
    options: { conditionalWrite: { expectedRevision: null } },
  });
  const snapshot = await first.service.getEntityWriteSnapshot(request);
  assert(snapshot);
  const results = await Promise.allSettled(
    [first, second].map(({ service }, index) =>
      service.updateEntity({
        entity: {
          ...snapshot.entity,
          content: `${snapshot.entity.content}\nWriter ${index}`,
        },
        options: { conditionalWrite: { expectedRevision: snapshot.revision } },
      }),
    ),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  const failed = results.find((result) => result.status === "rejected");
  assert(failed?.status === "rejected");
  const error: unknown = failed.reason;
  assert(error instanceof Error);
  expect(error.name).toBe("EntityWriteConflictError");
  expect(
    (await second.service.getEntityWriteSnapshot(request))?.revision,
  ).not.toBe(snapshot.revision);
  await assert.rejects(
    second.service.createEntity({
      entity: entity(request.id),
      options: { conditionalWrite: { expectedRevision: null } },
    }),
    { name: "EntityWriteConflictError" },
  );
});

test("entity and projection validation preserve field diagnostics across authenticated RPC", async () => {
  let refuse = true;
  ownerRegistry.registerPersistValidator("note", async () => {
    if (refuse)
      throw new z.ZodError([
        {
          code: "custom",
          path: ["areas", 0],
          message: "Choose a configured area",
        },
      ]);
  });
  const check = (error: unknown): boolean => {
    assert(error instanceof EntityValidationError);
    expect(isEntityValidationError(error)).toBe(true);
    expect(error).toMatchObject({
      entityType: "note",
      phase: "persist",
      originalError: {
        issues: [{ path: ["areas", 0], message: "Choose a configured area" }],
      },
    });
    return true;
  };
  await assert.rejects(
    first.service.createEntity({ entity: entity("invalid") }),
    check,
  );
  expect(
    await owner.getEntityRaw({ entityType: "note", id: "invalid" }),
  ).toBeNull();
  const store = second.service.getProjectionStore();
  await store.markDirty({
    sourceType: "note",
    sourceId: "source",
    revision: "one",
    operation: "upsert",
    markedAt: Date.now(),
  });
  await store.claimPendingWave({
    waveId: "validation-wave",
    graphFingerprint: "fixture",
    startedAt: Date.now(),
  });
  await store.putWaveRules("validation-wave", [
    { ruleId: "rule", targetType: "note", level: 0 },
  ]);
  const input = {
    waveId: "validation-wave",
    ruleId: "rule",
    ruleVersion: "1",
    inputFingerprint: "one",
    completedAt: Date.now(),
    writeIntents: [
      { operation: "upsert" as const, entity: entity("projected") },
    ],
  };
  await assert.rejects(store.applyRuleResult(input), check);
  expect(
    await owner.getEntityRaw({ entityType: "note", id: "projected" }),
  ).toBeNull();
  expect(
    await store.getRuleMemo({
      ruleId: "rule",
      ruleVersion: "1",
      inputFingerprint: "one",
    }),
  ).toBeNull();
  expect(await owner.listPendingEntityExports()).toEqual([]);
  refuse = false;
  expect(await store.applyRuleResult(input)).toMatchObject({
    status: "completed",
  });
});

test("Studio reports owner validation as field-level HTTP 400 rather than a generic server failure", async () => {
  ownerRegistry.registerPersistValidator("note", async () => {
    throw new z.ZodError([
      { code: "custom", path: ["areas"], message: "Choose a configured area" },
    ]);
  });
  const shell = createMockShell({ entityService: first.service });
  spyOn(shell, "getEntityRegistry").mockReturnValue(registry());
  const context = createServicePluginContext(shell, "studio");
  const routes = createEditorRoutes({
    routePath: "/studio",
    getContext: () => context,
    getEntityDisplay: () => undefined,
    workspaceRegistry: new StudioWorkspaceRegistry(),
    resolveAuthPrincipal: async () => ({
      userId: "editor",
      personId: "editor",
      displayName: "Editor",
      role: "admin",
      permissionLevel: "admin",
      status: "active",
      isAnchor: true,
    }),
  });
  const route = routes.find(
    (entry) => entry.method === "POST" && entry.path === "/studio/api/entities",
  );
  assert(route);
  const response = await route.handler(
    new Request("https://studio.test/studio/api/entities", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://studio.test",
      },
      body: JSON.stringify({
        entityType: "note",
        idPath: ["invalid"],
        frontmatter: { areas: ["Unlisted"] },
        body: "Body",
      }),
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: "Invalid entity data",
    issues: [{ path: ["areas"], message: "Choose a configured area" }],
  });
  expect(
    await owner.getEntityRaw({ entityType: "note", id: "invalid" }),
  ).toBeNull();
});

test("cancellation crosses the socket before releasing an owner-side validation gate", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  ownerRegistry.registerPersistValidator("note", async () => {
    entered.resolve();
    await release.promise;
  });
  const controller = new AbortController();
  const writing = first.service.createEntity({
    entity: entity("cancelled"),
    options: { signal: controller.signal },
  });
  const rejected = assert.rejects(writing, /cancel/i);
  try {
    await entered.promise;
    controller.abort(new Error("cancel fixture write"));
    await rejected;
    // Same-connection request follows the cancellation frame: its reply is
    // an ordering barrier, not a sleep or an assumed cancellation deadline.
    expect(await first.service.countEntities({ entityType: "note" })).toBe(0);
  } finally {
    release.resolve();
    await Promise.allSettled([writing, rejected]);
  }
  expect(
    await owner.getEntityRaw({ entityType: "note", id: "cancelled" }),
  ).toBeNull();
  expect(await owner.listPendingEntityExports()).toEqual([]);
});

test("authentication, request bounds, result bounds and callback refusal remain fail-closed", async () => {
  const intruder = new LocalDatabaseRpcClient({
    config: { ...endpoint.config, secret: "wrong".repeat(10) },
  });
  try {
    await assert.rejects(
      intruder.initialize(),
      /Local database endpoint closed/,
    );
  } finally {
    intruder.close();
  }
  await assert.rejects(
    first.client.request(ENTITY_RPC_SERVICE, {
      operation: "queryEntityHierarchy",
      request: { entityType: "note", limit: 101 },
    }),
  );
  const malformed = spyOn(owner, "queryGroupingCatalog").mockResolvedValue({
    values: [],
    total: -1,
  });
  try {
    await assert.rejects(
      first.service.queryGroupingCatalog({
        grouping: "areas",
        entityTypes: ["note"],
      }),
    );
  } finally {
    malformed.mockRestore();
  }
  let called = false;
  await assert.rejects(
    first.service.createEntity({
      entity: entity("callback"),
      options: {
        beforeWrite: async () => {
          called = true;
        },
      },
    }),
    /beforeWrite/,
  );
  expect(called).toBe(false);
  expect(
    await owner.getEntityRaw({ entityType: "note", id: "callback" }),
  ).toBeNull();
  expect(await first.service.countEntities({ entityType: "note" })).toBe(0);
});
