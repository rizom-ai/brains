import { afterEach, beforeEach, describe, expect, it } from "bun:test";
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
  type EntityRpcRequest,
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

  public request(payload: EntityRpcRequest): Promise<unknown> {
    return handleEntityRpcRequest(this.owner, payload);
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
    return error as Error;
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
      await owner.getEntity<Note>({ entityType: "note", id: "remote-note" }),
    ).toMatchObject({ title: "Owner boundary" });
    expect(
      await remote.listEntities<Note>({ entityType: "note" }),
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
    expect(await remote.search<Note>(searchRequest)).toEqual(
      await owner.search<Note>(searchRequest),
    );

    const entity = await remote.getEntity<Note>({
      entityType: "note",
      id: "remote-note",
      visibilityScope: "restricted",
    });
    expect(entity).not.toBeNull();
    expect(remote.serializeEntity(entity as Note)).toContain("Owner boundary");
    expect(remote.deserializeEntity("# Local\n\nbody", "note")).toMatchObject({
      title: "Untitled",
    });

    expect(
      await remote.deleteEntity({ entityType: "note", id: "remote-note" }),
    ).toBe(true);
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
    expect(outcome.status).toBe("completed");
    expect(await store.completeWave("remote-wave", 103)).toMatchObject({
      status: "completed",
    });
  });

  it("rejects malformed operations before owner dispatch", () => {
    const error = captureThrown(() =>
      handleEntityRpcRequest(owner, {
        operation: "getEntity",
        request: { entityType: "note", id: "", visibilityScope: "public" },
      }),
    );
    expect(error.name).toBe("ZodError");
  });
});
