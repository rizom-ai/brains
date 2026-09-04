import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { prepareAsset } from "@brains/assets";
import { ENTITY_CHANNELS } from "@brains/contracts";
import {
  createMockJobQueueService,
  createSilentLogger,
} from "@brains/test-utils";
import {
  EntityRegistry,
  RemoteEntityService,
  handleEntityRpcRequest,
  handleProjectionStoreRpcRequest,
  parseEntityRpcCall,
  parseEntityRpcRequest,
  type EntityRpcCall,
  type EntityRpcTransport,
  type ProjectionStoreRpcRequest,
  type ProjectionStoreRpcTransport,
} from "../src";
import type { EntityService } from "../src/entityService";
import type { EntityEventBus } from "../src/types";
import { mockEmbeddingService } from "./helpers/mock-services";
import { setupEntityService } from "./helpers/setup-entity-service";
import {
  createNoteInput,
  noteAdapter,
  noteSchema,
  type Note,
} from "./helpers/test-schemas";

class DirectEntityTransport implements EntityRpcTransport {
  private readonly owner: EntityService;

  public constructor(owner: EntityService) {
    this.owner = owner;
  }

  public async initialize(): Promise<void> {}

  public request(payload: EntityRpcCall): Promise<unknown> {
    // Mirrors the owner registration in service-factory: parse the call
    // envelope and re-enter any batch scope it carries before dispatch.
    const call = parseEntityRpcCall(payload);
    const dispatch = (): Promise<unknown> =>
      handleEntityRpcRequest(this.owner, call.request);
    if (!call.batchScope) return dispatch();
    return this.owner
      .getProjectionStore()
      .runInBatchScope(call.batchScope, dispatch);
  }

  public close(): void {}
}

class DirectProjectionTransport implements ProjectionStoreRpcTransport {
  private readonly owner: EntityService;

  public constructor(owner: EntityService) {
    this.owner = owner;
  }

  public async initialize(): Promise<void> {}

  public request(payload: ProjectionStoreRpcRequest): Promise<unknown> {
    return handleProjectionStoreRpcRequest(
      this.owner.getProjectionStore(),
      payload,
    );
  }

  public close(): void {}
}

function captureThrown(invocation: () => unknown): Error {
  try {
    invocation();
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error("Expected invocation to throw");
}

describe("entity owner RPC", () => {
  let owner: EntityService;
  let remote: RemoteEntityService;
  let cleanup: () => Promise<void>;
  let createdEvents: number;

  beforeEach(async () => {
    createdEvents = 0;
    const eventBus: EntityEventBus = {
      send: async (request): Promise<unknown> => {
        if (request.type === ENTITY_CHANNELS.created) createdEvents++;
        return undefined;
      },
    };
    const context = await setupEntityService(
      [
        {
          name: "note",
          schema: noteSchema,
          adapter: noteAdapter,
          config: { embeddable: false },
        },
      ],
      { messageBus: eventBus },
    );
    owner = context.entityService;
    cleanup = context.cleanup;

    const logger = createSilentLogger("entity-rpc-worker");
    const workerRegistry = EntityRegistry.createFresh(logger);
    workerRegistry.registerEntityType("note", noteSchema, noteAdapter, {
      embeddable: false,
    });
    remote = new RemoteEntityService({
      transport: new DirectEntityTransport(owner),
      projectionTransport: new DirectProjectionTransport(owner),
      embeddingService: mockEmbeddingService,
      entityRegistry: workerRegistry,
      jobQueueService: createMockJobQueueService(),
      logger,
    });
    await Promise.all([owner.initialize(), remote.initialize()]);
  });

  afterEach(async () => {
    remote.close();
    owner.close();
    await cleanup();
  });

  it("routes CRUD, search, counts, and local serialization", async () => {
    const created = await remote.createEntity<Note>({
      entity: createNoteInput(
        { title: "Owner boundary", content: "searchable content", tags: [] },
        "remote-note",
      ),
    });

    expect(created).toMatchObject({
      entityId: "remote-note",
      skipped: false,
    });
    expect(createdEvents).toBe(1);
    expect(
      await owner.getEntity<Note>(
        { entityType: "note", id: "remote-note" },
        noteSchema,
      ),
    ).toMatchObject({ title: "Owner boundary" });
    expect(
      await remote.listEntities<Note>({ entityType: "note" }, noteSchema),
    ).toHaveLength(1);
    expect(await remote.countEntities({ entityType: "note" })).toBe(1);
    expect(await remote.getEntityCounts("restricted")).toContainEqual({
      entityType: "note",
      count: 1,
    });
    const searchRequest = {
      query: "searchable",
      options: { visibilityScope: "restricted" as const },
    };
    expect(await remote.search(searchRequest)).toEqual(
      await owner.search(searchRequest),
    );

    const entity = await remote.getEntity<Note>(
      {
        entityType: "note",
        id: "remote-note",
        visibilityScope: "restricted",
      },
      noteSchema,
    );
    expect(entity).not.toBeNull();
    expect(remote.serializeEntity(noteSchema.parse(entity))).toContain(
      "Owner boundary",
    );
    expect(remote.deserializeEntity("# Local\n\nbody", "note")).toMatchObject({
      title: "Untitled",
    });

    expect(await remote.hasPendingEntityExports()).toBe(true);
    const pendingExports = await remote.listPendingEntityExports();
    expect(pendingExports).toHaveLength(1);
    expect(
      await remote.acknowledgeEntityExports({
        intents: pendingExports,
      }),
    ).toBe(1);
    expect(
      await remote.isProjectionOwnedEntity({
        entityType: "note",
        id: "remote-note",
      }),
    ).toBe(false);
    expect(
      await remote.deleteEntity({
        entityType: "note",
        id: "remote-note",
        options: { persistenceOrigin: "directory-sync" },
      }),
    ).toBe(true);
    expect(await remote.hasPendingEntityExports()).toBe(false);
    expect(
      await owner.getEntity({ entityType: "note", id: "remote-note" }),
    ).toBeNull();
  });

  it("proxies the narrow async projection store", async () => {
    const store = remote.getProjectionStore();
    const generation = await store.markDirty({
      sourceType: "note",
      sourceId: "source-1",
      revision: "revision-1",
      operation: "upsert",
      markedAt: 100,
    });
    expect(generation).toBeGreaterThan(0);
    expect(await store.listPendingInputs()).toMatchObject([
      { sourceId: "source-1", revision: "revision-1" },
    ]);

    const wave = await store.claimPendingWave({
      waveId: "remote-wave",
      graphFingerprint: "graph-1",
      startedAt: 101,
    });
    expect(wave).toMatchObject({ id: "remote-wave", status: "running" });
    await store.putWaveRules("remote-wave", [
      { ruleId: "note-rule", targetType: "note", level: 0 },
    ]);
    expect(
      await store.queueWaveRule("remote-wave", "note-rule", "job-1"),
    ).toMatchObject({ status: "queued", jobId: "job-1" });
    const outcome = await store.applyRuleResult({
      waveId: "remote-wave",
      ruleId: "note-rule",
      ruleVersion: "1",
      inputFingerprint: "input-1",
      writeIntents: [],
      completedAt: 102,
    });
    if (!outcome) throw new Error("expected the wave rule to accept a result");
    expect(outcome.status).toBe("completed");
    expect(await store.completeWave("remote-wave", 103)).toMatchObject({
      status: "completed",
    });

    await store.markDirty({
      sourceType: "note",
      sourceId: "source-2",
      revision: "revision-2",
      operation: "upsert",
      markedAt: 104,
    });
    await store.claimPendingWave({
      waveId: "remote-failed-wave",
      graphFingerprint: "graph-1",
      startedAt: 105,
    });
    await store.putWaveRules("remote-failed-wave", [
      { ruleId: "note-rule", targetType: "note", level: 0 },
    ]);
    await store.queueWaveRule("remote-failed-wave", "note-rule", "job-2");
    expect(
      await store.failWaveWithIncident({
        waveId: "remote-failed-wave",
        ruleId: "note-rule",
        jobId: "job-2",
        failureReason: "remote terminal failure",
        failedAt: 106,
      }),
    ).toMatchObject({ status: "failed" });
    expect(await store.getUnresolvedProjectionIncidentDiagnostics()).toEqual({
      total: 1,
      incidents: [
        expect.objectContaining({
          waveId: "remote-failed-wave",
          ruleId: "note-rule",
          jobId: "job-2",
          failureReason: "remote terminal failure",
        }),
      ],
    });
  });

  it("shares complete mutation and durable-batch request contracts", () => {
    const preparedAsset = prepareAsset(new Uint8Array([1, 2, 3]));
    const entity = {
      id: "asset-1",
      entityType: "asset",
      content: preparedAsset.ref,
      created: "2026-09-02T12:00:00.000Z",
      updated: "2026-09-02T12:00:00.000Z",
      visibility: "public" as const,
      metadata: {},
      contentHash: "hash",
    };

    expect(
      parseEntityRpcRequest({
        operation: "upsertEntity",
        request: {
          entity,
          preparedAsset,
          options: { persistenceOrigin: "directory-sync" },
        },
      }),
    ).toMatchObject({
      request: {
        preparedAsset: { ref: preparedAsset.ref },
        options: { persistenceOrigin: "directory-sync" },
      },
    });
    expect(
      parseEntityRpcRequest({
        operation: "prepareDurableBulkMutation",
        input: {
          source: "directory-sync",
          operationId: "sync-request",
          rootJobId: "root-job",
          expectedChildren: 2,
        },
      }),
    ).toMatchObject({ input: { expectedChildren: 2 } });
  });

  it("rejects malformed operations before owner dispatch", () => {
    const error = captureThrown(() =>
      handleEntityRpcRequest(owner, {
        operation: "getEntity",
        request: { entityType: "note", id: "", visibilityScope: "public" },
      }),
    );
    expect(error.name).toBe("ZodError");
    expect(() =>
      parseEntityRpcRequest({
        operation: "search",
        request: { query: "x", options: { minScore: -1 } },
      }),
    ).toThrow();
    expect(() =>
      parseEntityRpcRequest({
        operation: "createEntity",
        request: {
          entity: {
            entityType: "note",
            content: "bad date",
            created: "yesterday",
            metadata: {},
          },
        },
      }),
    ).toThrow();
  });
});
