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
import {
  createTestEntityAdapter,
  createMockDataSourceRegistry,
} from "@brains/entity-service/test";
import { createMockAIService } from "@brains/ai-service/test";
import {
  ContentService,
  ContentGenerationJobHandler,
  GenerationAuthorizer,
  registerGenerationWriteAdmission,
  type ContentGenerationJobData,
} from "@brains/content-service";
import {
  InMemoryTemplateRegistry,
  PermissionService,
  type UserPermissionLevel,
} from "@brains/templates";
import type { IEntityService } from "@brains/entity-service";
import { createMockProgressReporter } from "@brains/test-utils";
import {
  ContactPlugin,
  ContactRequestPlugin,
  ContactAdmission,
  ContactIntake,
} from "@brains/contact";
import { RuntimeStateService } from "@brains/runtime-state";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { jsonObjectSchema } from "@brains/contracts";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createMockJobQueueService } from "@brains/job-queue/test";
import { createSilentLogger, createTestDatabase } from "@brains/test-utils";
import {
  startEntityOwnerEndpoint,
  type EntityOwnerEndpoint,
  type EntityOwnerConnection,
} from "./helpers/entity-owner-endpoint";

import { ImportBurstOwnerProbe } from "./helpers/import-burst-owner-probe";

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

test("import-burst observation retains private notes, literal markers and the probe ID predicate", async () => {
  const marker = "Update marker: delayed.";
  for (const [id, visibility, content] of [
    ["directory-sync-stress-001", "public", marker],
    ["directory-sync-stress-002", "restricted", marker],
    ["not-a-probe", "shared", marker],
    ["directory-sync-stress-003", "restricted", "Update marker: DELAYED."],
  ] as const) {
    await owner.createEntity({
      entity: { ...entity(id), visibility, content },
    });
  }
  const probe = new ImportBurstOwnerProbe(first.client);
  expect(await probe.countNotes()).toBe(4);
  expect(await probe.countProbeNotesWithMarker(marker)).toBe(2);
  expect(await probe.countProbeNotesWithMarker("missing marker")).toBe(0);
});

test("import-burst marker scans bound row visits and deduplicate IDs shifted by concurrent imports", async () => {
  const marker = "Concurrent probe marker";
  for (const suffix of ["b", "c"])
    await owner.createEntity({
      entity: { ...entity(`directory-sync-stress-${suffix}`), content: marker },
    });
  let pages = 0;
  const probe = new ImportBurstOwnerProbe({
    request: async (service, payload, options): Promise<unknown> => {
      const call = z
        .object({ operation: z.literal("listEntities") })
        .safeParse(payload);
      if (call.success) {
        pages++;
        if (pages === 2)
          await owner.createEntity({
            entity: { ...entity("directory-sync-stress-a"), content: marker },
          });
      }
      return first.client.request(service, payload, options);
    },
  });
  expect(await probe.countProbeNotesWithMarker(marker)).toBe(1);
  expect(pages).toBe(2);
  expect(
    await new ImportBurstOwnerProbe(first.client).countProbeNotesWithMarker(
      marker,
    ),
  ).toBe(3);
});

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

test("named owner admission validates its payload and protects create, update and no-op exports", async () => {
  let allowed = true;
  const observed: Array<{ content: string; operation: string }> = [];
  ownerRegistry.writeAdmissions.register(
    "fixture:grant",
    z.strictObject({ id: z.string() }),
    async (context, payload): Promise<void> => {
      assert.equal(context.entity.id, payload.id);
      observed.push({
        content: context.entity.content,
        operation: context.operation,
      });
      if (!allowed) throw new Error("Owner grant revoked");
    },
  );
  const options = {
    writeAdmission: { name: "fixture:grant", payload: { id: "guarded" } },
  };
  await first.service.createEntity({ entity: entity("guarded"), options });
  const request = {
    entityType: "note",
    id: "guarded",
    visibilityScope: "shared" as const,
  };
  const snapshot = await owner.getEntityWriteSnapshot(request);
  assert(snapshot);
  expect(observed).toEqual([
    { content: snapshot.entity.content, operation: "create" },
  ]);
  const noop = await second.service.updateEntity({
    entity: snapshot.entity,
    options,
  });
  expect(noop.skipped).toBe(true);
  expect(observed.at(-1)?.operation).toBe("update");
  const exports = await owner.listPendingEntityExports();
  allowed = false;
  await assert.rejects(
    second.service.updateEntity({ entity: snapshot.entity, options }),
    /Owner grant revoked/,
  );
  await assert.rejects(
    second.service.updateEntity({
      entity: { ...snapshot.entity, content: "Changed content" },
      options,
    }),
    /Owner grant revoked/,
  );
  await assert.rejects(
    first.service.createEntity({
      entity: entity("denied"),
      options: {
        writeAdmission: { name: "fixture:grant", payload: { id: "denied" } },
      },
    }),
    /Owner grant revoked/,
  );
  await assert.rejects(
    first.service.createEntity({
      entity: entity("invalid-payload"),
      options: {
        writeAdmission: { name: "fixture:grant", payload: { id: 123 } },
      },
    }),
  );
  await assert.rejects(
    first.service.createEntity({
      entity: entity("unknown-guard"),
      options: { writeAdmission: { name: "fixture:unknown", payload: {} } },
    }),
    /Unknown write admission/,
  );
  await assert.rejects(
    first.client.request(ENTITY_RPC_SERVICE, {
      operation: "createEntity",
      request: {
        entity: entity("oversized-guard"),
        options: {
          writeAdmission: {
            name: "fixture:grant",
            payload: { id: "💾".repeat(4096) },
          },
        },
      },
    }),
    /16 KiB/,
  );
  expect(await owner.getEntityWriteSnapshot(request)).toEqual(snapshot);
  expect(
    await owner.countEntities({
      entityType: "note",
      options: { filter: { visibilityScope: "shared" } },
    }),
  ).toBe(1);
  expect(await owner.listPendingEntityExports()).toEqual(exports);
  expect(observed).toHaveLength(5);
});

test("removing an owner admission during authorization rolls back the native transaction", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const dispose = ownerRegistry.writeAdmissions.register(
    "fixture:removable",
    z.null(),
    async (): Promise<void> => {
      entered.resolve();
      await release.promise;
    },
  );
  const writing = first.service.createEntity({
    entity: entity("removed-guard"),
    options: { writeAdmission: { name: "fixture:removable", payload: null } },
  });
  const rejected = assert.rejects(writing, /Write admission was removed/);
  try {
    await Promise.race([entered.promise, writing]);
    dispose();
  } finally {
    release.resolve();
    await rejected;
  }
  expect(
    await owner.getEntityRaw({
      entityType: "note",
      id: "removed-guard",
      visibilityScope: "shared",
    }),
  ).toBeNull();
  expect(await owner.listPendingEntityExports()).toEqual([]);
});

test("socket cancellation reaches an in-transaction owner admission before commit", async () => {
  const entered = Promise.withResolvers<void>();
  const cancelled = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  ownerRegistry.writeAdmissions.register(
    "fixture:cancellation",
    z.null(),
    async ({ signal }): Promise<void> => {
      assert(signal);
      signal.addEventListener("abort", (): void => cancelled.resolve(), {
        once: true,
      });
      if (signal.aborted) cancelled.resolve();
      entered.resolve();
      await release.promise;
    },
  );
  const controller = new AbortController();
  const writing = first.service.createEntity({
    entity: entity("cancelled-admission"),
    options: {
      signal: controller.signal,
      writeAdmission: { name: "fixture:cancellation", payload: null },
    },
  });
  const rejected = assert.rejects(writing, /cancel/i);
  try {
    await Promise.race([entered.promise, writing]);
    controller.abort(new Error("cancel owner admission"));
    // Observe the owner's signal, not just the borrower's early rejection.
    // Root database reads cannot be used as a barrier inside this transaction.
    await cancelled.promise;
  } finally {
    release.resolve();
    await rejected;
  }
  expect(
    await owner.getEntityRaw({
      entityType: "note",
      id: "cancelled-admission",
      visibilityScope: "shared",
    }),
  ).toBeNull();
  expect(await owner.listPendingEntityExports()).toEqual([]);
});

for (const operation of ["create", "update"] as const) {
  test(`generation ${operation} uses current owner authority rather than the worker's earlier grant`, async () => {
    let ownerLevel: UserPermissionLevel = "admin";
    let revokeOnGeneration = true;
    let ownerChecks = 0;
    let generated = 0;
    const makeContent = (
      entities: IEntityService,
      ownerSide: boolean,
    ): ContentService => {
      const templates = InMemoryTemplateRegistry.createFresh(logger);
      templates.register("fixture:note", {
        name: "fixture:note",
        description: "Generated note",
        requiredPermission: "trusted",
        basePrompt: "Write",
        dataSourceId: "fixture:ai",
        schema: z.string(),
        formatter: {
          format: (value): string => z.string().parse(value),
          parse: (value): string => value,
        },
      });
      const sources = createMockDataSourceRegistry();
      spyOn(sources, "get").mockReturnValue({
        id: "fixture:ai",
        name: "No external provider",
        generateScoped: async (_request, schema) => {
          generated++;
          if (revokeOnGeneration) ownerLevel = "public";
          return schema.parse("Generated note");
        },
      });
      return new ContentService({
        logger,
        entityService: entities,
        templateRegistry: templates,
        dataSourceRegistry: sources,
        aiService: createMockAIService(),
        generationAuthorizer: new GenerationAuthorizer(
          new PermissionService({
            entityActions: { note: { create: "trusted", update: "trusted" } },
          }),
          async () => {
            if (ownerSide) ownerChecks++;
            return {
              userId: "usr_writer",
              permissionLevel: ownerSide ? ownerLevel : "admin",
            };
          },
        ),
      });
    };
    const dispose = registerGenerationWriteAdmission(
      ownerRegistry.writeAdmissions,
      makeContent(owner, true),
    );
    try {
      const worker = makeContent(first.service, false);
      const handler = ContentGenerationJobHandler.createFresh(
        worker,
        first.service,
      );
      const target = {
        entityType: "note",
        id: `generation-${operation}`,
        visibilityScope: "shared" as const,
      };
      if (operation === "update")
        await owner.createEntity({ entity: entity(target.id) });
      const before = await owner.getEntityWriteSnapshot(target);
      const exports = await owner.listPendingEntityExports();
      const data: ContentGenerationJobData = {
        authority: {
          actor: { kind: "user", userId: "usr_writer" },
          permissionCeiling: "admin",
          principalId: "usr_writer",
        },
        templateName: "fixture:note",
        context: {},
        destination: {
          entityType: "note",
          entityId: target.id,
          metadata: {},
          visibility: "shared",
        },
        expectedRevision: before?.revision ?? null,
      };
      await assert.rejects(
        handler.process(
          data,
          "denied-generation",
          createMockProgressReporter(),
        ),
        { name: "GenerationAuthorizationError" },
      );
      expect(generated).toBe(1);
      expect(ownerChecks).toBe(1);
      expect(await owner.getEntityWriteSnapshot(target)).toEqual(before);
      expect(await owner.listPendingEntityExports()).toEqual(exports);
      // A distinct target/job after acknowledged refusal, not an uncertain replay.
      ownerLevel = "admin";
      revokeOnGeneration = false;
      const next = {
        ...data,
        destination: { ...data.destination, entityId: "permitted-generation" },
        expectedRevision: null,
      };
      await handler.process(
        next,
        "new-generation",
        createMockProgressReporter(),
      );
      expect(ownerChecks).toBe(2);
      expect(generated).toBe(2);
      expect(
        (
          await owner.getEntityRaw({
            entityType: "note",
            id: next.destination.entityId,
            visibilityScope: "shared",
          })
        )?.content,
      ).toContain("Generated note");
    } finally {
      dispose();
    }
  });
}

async function contactFixture(): Promise<{
  state: RuntimeStateService;
  admission: ContactAdmission;
  intake(service?: IEntityService): ContactIntake;
  queued: Set<string>;
}> {
  const database = await createTestDatabase({
    prefix: "contact-wire-",
    filename: "runtime.db",
    migrate: (url) => migrateRuntimeState({ url }, logger),
  });
  retire.push(database.cleanup);
  const state = RuntimeStateService.createFresh({ url: database.url }, logger);
  retire.push(() => state.closeAsync());
  // Join every entity handler before retiring the separate state owner it reads.
  retire.push(endpoint.close);
  await state.initialize();
  const shell = createMockShell({ entityService: owner });
  spyOn(shell, "getEntityRegistry").mockReturnValue(ownerRegistry);
  spyOn(shell, "getRuntimeState").mockReturnValue(state);
  const entityPlugin = new ContactRequestPlugin();
  await entityPlugin.register(shell);
  retire.push(() => entityPlugin.shutdown());
  const policy = { retentionSeconds: 86400, maxRecords: 1, maxBytes: 100000 };
  const admissionPolicy = {
    windowSeconds: 60,
    globalRequests: 100,
    networkRequests: 50,
    globalForms: 10,
    networkForms: 5,
    globalSubmissions: 8,
    networkSubmissions: 4,
    tokenTtlSeconds: 30,
    receiptTtlSeconds: 120,
    maxEntries: 20,
  };
  const plugin = new ContactPlugin({
    intake: {
      http: {
        origin: "https://contact.test",
        maxBodyBytes: 20000,
        readTimeoutMs: 10000,
      },
      admission: admissionPolicy,
      storage: policy,
      delivery: { maxAttempts: 3, retryWindowSeconds: 3600 },
      inboxUrl: "https://contact.test/studio/workspaces/unified-inbox%3Ainbox",
      preview: false,
    },
  });
  retire.push(() => plugin.shutdown());
  await plugin.register(shell);
  const admission = new ContactAdmission(state, admissionPolicy);
  const queued = new Set<string>();
  return {
    state,
    admission,
    queued,
    intake: (service = first.service): ContactIntake =>
      new ContactIntake({
        admission,
        entities: service,
        state,
        policy,
        enqueueNotification: async (id): Promise<void> => {
          queued.add(id);
        },
      }),
  };
}

const contactInput = {
  name: "Ada",
  email: "private@example.test",
  message: "Private message",
};
const contactPeer = "192.0.2.1";
for (const ineligible of ["expired", "stored"] as const) {
  test(`Contact ${ineligible} slot is refused at the owner write boundary without refund or replay`, async () => {
    const runtime = await contactFixture();
    const ledger = runtime.state.scoped({
      namespace: "contact.storage",
      schema: jsonObjectSchema,
    });
    let writes = 0;
    ownerRegistry.registerPersistValidator(
      "contact-request",
      async (entity): Promise<void> => {
        writes++;
        const record = await ledger.get("slots");
        assert(record);
        const slots = z
          .record(z.string(), jsonObjectSchema)
          .parse(record["slots"]);
        const slot = slots[entity.id];
        assert(slot);
        expect(
          await ledger.compareAndSet("slots", record, {
            ...record,
            slots: {
              ...slots,
              [entity.id]: {
                ...slot,
                ...(ineligible === "expired"
                  ? { expiresAt: Date.now() - 1 }
                  : { phase: "stored" }),
              },
            },
          }),
        ).toBe(true);
      },
    );
    const form = await runtime.admission.issue(contactPeer);
    assert(form.kind === "issued");
    const intake = runtime.intake();
    expect(
      await intake.submit(
        form.token,
        contactInput,
        contactPeer,
        new AbortController().signal,
      ),
    ).toEqual({ kind: "denied", reason: "unavailable" });
    expect(
      await owner.countEntities({
        entityType: "contact-request",
        options: { filter: { visibilityScope: "restricted" } },
      }),
    ).toBe(0);
    expect(await owner.listPendingEntityExports()).toEqual([]);
    expect(runtime.queued.size).toBe(0);
    expect(
      (
        await intake.submit(
          form.token,
          contactInput,
          contactPeer,
          new AbortController().signal,
        )
      ).kind,
    ).toBe("denied");
    const next = await runtime.admission.issue(contactPeer);
    assert(next.kind === "issued");
    expect(
      await intake.submit(
        next.token,
        { ...contactInput, message: "Another request" },
        contactPeer,
        new AbortController().signal,
      ),
    ).toEqual({ kind: "denied", reason: "capacity" });
    expect(writes).toBe(1);
  });
}

test("Contact cancellation before owner admission preserves the uncertain slot without publishing", async () => {
  const runtime = await contactFixture();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let writes = 0;
  ownerRegistry.registerPersistValidator(
    "contact-request",
    async (): Promise<void> => {
      writes++;
      entered.resolve();
      await release.promise;
    },
  );
  const form = await runtime.admission.issue(contactPeer);
  assert(form.kind === "issued");
  const controller = new AbortController();
  const writing = runtime
    .intake()
    .submit(form.token, contactInput, contactPeer, controller.signal);
  try {
    await Promise.race([
      entered.promise,
      writing.then((): never => {
        throw new Error("Contact submission finished before validation gate");
      }),
    ]);
    controller.abort(new Error("Cancel contact publication"));
    // Same-connection reply proves the preceding cancel frame reached the owner.
    expect(
      await first.service.countEntities({
        entityType: "contact-request",
        options: { filter: { visibilityScope: "restricted" } },
      }),
    ).toBe(0);
  } finally {
    release.resolve();
    await writing;
  }
  expect(await writing).toEqual({ kind: "denied", reason: "unavailable" });
  expect(
    await owner.countEntities({
      entityType: "contact-request",
      options: { filter: { visibilityScope: "restricted" } },
    }),
  ).toBe(0);
  expect(await owner.listPendingEntityExports()).toEqual([]);
  expect(runtime.queued.size).toBe(0);
  const ledger = await runtime.state
    .scoped({ namespace: "contact.storage", schema: jsonObjectSchema })
    .get("slots");
  assert(ledger);
  const slots = z.record(z.string(), jsonObjectSchema).parse(ledger["slots"]);
  expect(Object.values(slots)).toMatchObject([{ phase: "writing" }]);
  expect(
    await runtime
      .intake(second.service)
      .submit(
        form.token,
        contactInput,
        contactPeer,
        new AbortController().signal,
      ),
  ).toEqual({ kind: "denied", reason: "unavailable" });
  expect(writes).toBe(1);
});

test("Contact recovers an actually lost socket acknowledgement by reading, never replaying the create", async () => {
  const runtime = await contactFixture();
  const original = owner.createEntity.bind(owner);
  let writes = 0;
  const create = spyOn(owner, "createEntity").mockImplementation(
    async (request) => {
      writes++;
      const result = await original(request);
      // Close the borrower before the owner handler can send its real reply.
      first.client.close();
      return result;
    },
  );
  try {
    const form = await runtime.admission.issue(contactPeer);
    assert(form.kind === "issued");
    expect(
      await runtime
        .intake()
        .submit(
          form.token,
          contactInput,
          contactPeer,
          new AbortController().signal,
        ),
    ).toEqual({ kind: "denied", reason: "unavailable" });
    const recovered = await runtime
      .intake(second.service)
      .submit(
        form.token,
        contactInput,
        contactPeer,
        new AbortController().signal,
      );
    assert(recovered.kind === "saved");
    expect(writes).toBe(1);
    expect(runtime.queued).toEqual(new Set([recovered.id]));
    expect(
      await owner.countEntities({
        entityType: "contact-request",
        options: { filter: { visibilityScope: "restricted" } },
      }),
    ).toBe(1);
    expect(await owner.listPendingEntityExports()).toHaveLength(1);
  } finally {
    create.mockRestore();
  }
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
