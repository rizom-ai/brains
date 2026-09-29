import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prepareAsset, assetRefSchema } from "@brains/assets";
import { EntityBinaryClient } from "../src/entity-binary-client";
import { EntityWriteConflictError } from "../src/entity-write-contracts";
import { EntityFileRuntime } from "../src/entity-file-runtime";
import { ENTITY_CHANNELS } from "@brains/contracts";
import type { BinaryPersistence } from "@brains/db/binary-publication";
import { createMockJobQueueService } from "@brains/job-queue/test";
import { createSilentLogger } from "@brains/test-utils";
import { createTestEntity } from "@brains/entity-service/test";
import {
  EntityRegistry,
  RemoteEntityService,
  createEntityRpcHandler,
  createEntityBinaryRpcHandlers,
  createEntityPublicationRpcHandler,
  handleEntityRpcRequest,
  handleProjectionStoreRpcRequest,
  parseEntityRpcCall,
  parseEntityRpcRequest,
  parseEntityRpcResult,
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
  minimalTestSchema,
  minimalTestAdapter,
  noteSchema,
  type Note,
} from "./helpers/test-schemas";

class DirectEntityTransport implements EntityRpcTransport {
  private readonly owner: EntityService;
  private readonly handler: ReturnType<typeof createEntityRpcHandler>;
  private readonly connection = new AbortController();

  public constructor(owner: EntityService) {
    this.owner = owner;
    this.handler = createEntityRpcHandler(owner);
  }

  public async initialize(): Promise<void> {}

  public request(
    payload: EntityRpcCall,
    options?: { signal?: AbortSignal | undefined },
  ): Promise<unknown> {
    // Mirrors the owner registration in service-factory: parse the call
    // envelope and re-enter any batch scope it carries before dispatch.
    const call = parseEntityRpcCall(payload);
    const dispatch = (): Promise<unknown> =>
      this.handler(
        call.request,
        options?.signal ?? new AbortController().signal,
        this.connection.signal,
      );
    if (!call.batchScope) return dispatch();
    return this.owner
      .getProjectionStore()
      .runInBatchScope(call.batchScope, dispatch);
  }

  public close(): void {
    this.connection.abort();
  }
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
  it("preserves literal filters and rejects retired guest-only read options", () => {
    const filter = {
      contentContains: "100%_",
      visibility: "restricted",
      visibilityScope: "public",
    } as const;
    for (const request of [
      {
        operation: "getEntity",
        request: { entityType: "test", id: "one" },
      },
      {
        operation: "listEntities",
        request: {
          entityType: "test",
          options: { limit: 1, filter },
        },
      },
      {
        operation: "countEntities",
        request: { entityType: "test", options: { filter } },
      },
      {
        operation: "search",
        request: { query: "needle" },
      },
    ] as const)
      expect(parseEntityRpcRequest(request)).toEqual(request);
    expect(() =>
      parseEntityRpcRequest({
        operation: "getEntity",
        request: { entityType: "test", id: "one", readBudget: { rows: 1 } },
      }),
    ).toThrow();
  });
  let owner: EntityService;
  let ownerRegistry: EntityRegistry;
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
          name: "test",
          schema: minimalTestSchema,
          adapter: minimalTestAdapter,
          config: {
            embeddable: false,
            fullTextSearchable: false,
            binaryStorage: "asset",
          },
        },
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
    ownerRegistry = context.entityRegistry;
    cleanup = context.cleanup;

    const logger = createSilentLogger("entity-rpc-worker");
    const workerRegistry = EntityRegistry.createFresh(logger);
    workerRegistry.registerEntityType("note", noteSchema, noteAdapter, {
      embeddable: false,
    });
    workerRegistry.registerEntityType(
      "test",
      minimalTestSchema,
      minimalTestAdapter,
      { embeddable: false, fullTextSearchable: false, binaryStorage: "asset" },
    );
    remote = new RemoteEntityService({
      transport: new DirectEntityTransport(owner),
      projectionTransport: new DirectProjectionTransport(owner),
      binaryTransport: {
        invalidate: (): void => {
          throw new Error("Unexpected binary invalidation");
        },
        control: async (): Promise<unknown> => ({
          ticket: "00000000-0000-4000-8000-000000000001",
        }),
        publication: async (): Promise<never> => {
          throw new Error("Unexpected binary publication");
        },
      },
      embeddingService: mockEmbeddingService,
      entityRegistry: workerRegistry,
      jobQueueService: createMockJobQueueService(),
      logger,
    });
    await Promise.all([owner.initialize(), remote.initialize()]);
  });

  afterEach(async () => {
    remote.close();
    await cleanup();
  });

  it("round-trips grouping, hierarchy and write snapshots with owner visibility", async () => {
    ownerRegistry.registerGrouping({
      key: "clients",
      label: "Clients",
      field: "clients",
      types: ["note"],
    });
    for (const visibility of ["public", "restricted"] as const) {
      await owner.createEntity<Note>({
        entity: {
          id: `folder:${visibility}`,
          entityType: "note",
          title: visibility,
          tags: [],
          content: "---\nclients: [Acme]\n---\n\nBody",
          metadata: {},
          visibility,
        },
      });
    }
    await owner.reprojectRegisteredGroupings();
    expect(await remote.ensureGroupingsReady()).toBe(true);
    expect(remote.areGroupingsReady()).toBe(false);
    await assert.rejects(
      remote.reprojectRegisteredGroupings(),
      /database owner/,
    );
    const request = { grouping: "clients", entityTypes: ["note"] };
    expect(await remote.queryGroupingCatalog(request)).toEqual({
      values: [{ value: "Acme", count: 1 }],
      total: 1,
    });
    expect(
      await remote.queryGroupingUsage({ ...request, values: ["Acme"] }),
    ).toEqual({
      entries: 1,
      values: [{ value: "Acme", count: 1 }],
    });
    const members = await remote.queryGroupingMembers({
      ...request,
      value: "Acme",
    });
    expect(members.total).toBe(1);
    expect(members.entities.map((entity) => entity.id)).toEqual([
      "folder:public",
    ]);
    const hierarchy = await remote.queryEntityHierarchy({ entityType: "note" });
    expect(hierarchy.folders).toEqual([
      { path: ["folder"], name: "folder", descendantCount: 1 },
    ]);
    expect(
      (
        await remote.queryEntityHierarchy({
          entityType: "note",
          prefix: ["folder"],
        })
      ).entities.map((entry) => entry.path),
    ).toEqual([["folder", "public"]]);
    const hidden = { entityType: "note", id: "folder:restricted" };
    expect(await remote.getEntityWriteSnapshot(hidden)).toBeNull();
    expect(
      await remote.getEntityWriteSnapshot({
        ...hidden,
        visibilityScope: "restricted",
      }),
    ).toEqual(
      await owner.getEntityWriteSnapshot({
        ...hidden,
        visibilityScope: "restricted",
      }),
    );
  });

  it("enforces conditional writes on the owner rather than a worker snapshot", async () => {
    const entity = createNoteInput(
      { title: "Conditional", content: "Original", tags: [] },
      "conditional",
    );
    await remote.createEntity({
      entity,
      options: { conditionalWrite: { expectedRevision: null } },
    });
    const request = { entityType: "note", id: "conditional" };
    const snapshot = await remote.getEntityWriteSnapshot(request);
    assert(snapshot);
    const outcomes = await Promise.allSettled(
      ["first", "second"].map((content) =>
        remote.updateEntity({
          entity: { ...snapshot.entity, content },
          options: {
            conditionalWrite: { expectedRevision: snapshot.revision },
          },
        }),
      ),
    );
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(EntityWriteConflictError);
    await assert.rejects(
      remote.createEntity({
        entity,
        options: { conditionalWrite: { expectedRevision: null } },
      }),
      EntityWriteConflictError,
    );
    expect((await remote.getEntityWriteSnapshot(request))?.revision).not.toBe(
      snapshot.revision,
    );
  });

  it("forwards mutation cancellation and refuses runtime callbacks before persistence", async () => {
    const entity = createNoteInput(
      { title: "Cancelled", content: "Original", tags: [] },
      "cancelled",
    );
    const controller = new AbortController();
    ownerRegistry.registerPersistValidator("note", async () => {
      controller.abort(new Error("cancelled validation"));
    });
    await assert.rejects(
      remote.createEntity({ entity, options: { signal: controller.signal } }),
      /cancelled validation/,
    );
    expect(
      await owner.getEntityRaw({ entityType: "note", id: "cancelled" }),
    ).toBeNull();
    let guarded = false;
    await assert.rejects(
      remote.createEntity({
        entity,
        options: {
          beforeWrite: async () => {
            guarded = true;
          },
        },
      }),
      /beforeWrite/,
    );
    expect(guarded).toBe(false);
    expect(
      await owner.getEntityRaw({ entityType: "note", id: "cancelled" }),
    ).toBeNull();
  });

  it("keeps grouping and hierarchy reads bounded and cancellation out of the wire", async () => {
    for (const operation of [
      "queryGroupingCatalog",
      "queryGroupingMembers",
      "queryEntityHierarchy",
    ] as const) {
      const request =
        operation === "queryEntityHierarchy"
          ? { entityType: "test", limit: 101 }
          : {
              grouping: "clients",
              entityTypes: ["test"],
              limit: 101,
              ...(operation === "queryGroupingMembers" && { value: "Acme" }),
            };
      expect(() => parseEntityRpcRequest({ operation, request })).toThrow();
    }
    const controller = new AbortController();
    controller.abort(new Error("cancelled grouping read"));
    await assert.rejects(
      remote.queryGroupingCatalog({
        grouping: "clients",
        entityTypes: ["test"],
        signal: controller.signal,
      }),
      /cancelled grouping read/,
    );
    expect(() =>
      parseEntityRpcRequest({
        operation: "queryGroupingCatalog",
        request: {
          grouping: "clients",
          entityTypes: ["test"],
          signal: controller.signal,
        },
      }),
    ).toThrow();
    expect(() =>
      parseEntityRpcResult(
        { operation: "queryGroupingUsage" },
        { entries: 0, values: [{ value: "Acme", count: -1 }] },
      ),
    ).toThrow();
  });

  it("exposes a metadata transfer client on the remote facade and closes its admission", async () => {
    expect(await remote.assetTransfers.offer(1)).toEqual({
      ticket: "00000000-0000-4000-8000-000000000001",
    });
    remote.close();
    await assert.rejects(remote.assetTransfers.offer(1), /closed/);
  });

  it("re-enters a publication batch scope before claim admission", async () => {
    const unexpected = async (): Promise<never> => {
      throw new Error("Unexpected binary admission");
    };
    const binary: BinaryPersistence = {
      offer: unexpected,
      upload: unexpected,
      endpoint: unexpected,
      cancel: unexpected,
      consume: unexpected,
      close: unexpected,
      reads: {
        offer: unexpected,
        download: unexpected,
        endpoint: unexpected,
        cancel: unexpected,
        close: unexpected,
      },
    };
    const scope = {
      batchId: "batch",
      source: "directory-sync",
      operationId: "operation",
      ownerToken: "token",
    };
    const primary = new Error("batch fence rejected");
    const store = owner.getProjectionStore();
    const original = store.runInBatchScope;
    store.runInBatchScope = async (received): Promise<never> => {
      expect(received).toEqual(scope);
      throw primary;
    };
    try {
      const handlers = createEntityBinaryRpcHandlers(owner, binary);
      const signal = new AbortController().signal;
      await assert.rejects(
        handlers.publication(
          {
            batchScope: scope,
            request: {
              operation: "createEntity",
              assetUploadId: randomUUID(),
              request: {
                entity: createTestEntity("test", {
                  content: `asset://sha256/${"0".repeat(64)}`,
                }),
              },
            },
          },
          signal,
          signal,
        ),
        (error: unknown) => error === primary,
      );
    } finally {
      store.runInBatchScope = original;
    }
  });

  it("rejects publication bytes without reading or hashing them or admitting a ticket", async () => {
    let touched = false;
    let admitted = false;
    const handler = createEntityPublicationRpcHandler(owner, {
      consumeClaim: () => {
        admitted = true;
        return Promise.reject(new Error("Unexpected admission"));
      },
    });
    const signal = new AbortController().signal;
    const entity = createTestEntity("test", {
      content: `asset://sha256/${"0".repeat(64)}`,
    });
    const request = {
      operation: "createEntity",
      assetUploadId: randomUUID(),
      request: {
        entity,
        preparedAsset: {
          get bytes(): Uint8Array {
            touched = true;
            throw new Error("Prepared bytes were accessed");
          },
        },
      },
    };
    await assert.rejects(handler(request, signal, signal), /preparedAsset/);
    await assert.rejects(
      handler(
        {
          ...request,
          request: {
            entity: { ...entity, content: "data:image/png;base64,AA==" },
          },
        },
        signal,
        signal,
      ),
      /asset reference/,
    );
    expect(touched).toBe(false);
    expect(admitted).toBe(false);
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

  it("uses native transfers for large mutations and reads without publishing bytes from a failed mutation", async () => {
    const binary = owner.getBinaryPersistence();
    assert.ok(binary);
    const handlers = createEntityBinaryRpcHandlers(owner, binary);
    const connection = new AbortController();
    const client = new EntityBinaryClient({
      transport: {
        control: (request, options): Promise<unknown> =>
          handlers.control(
            request,
            options?.signal ?? new AbortController().signal,
            connection.signal,
          ),
        publication: (request, options): Promise<unknown> =>
          handlers.publication(
            request,
            options?.signal ?? new AbortController().signal,
            connection.signal,
          ),
        invalidate: (error): void => connection.abort(error),
      },
    });
    const files = new EntityFileRuntime(
      client,
      {
        executable: process.execPath,
        inspectionUploadUrl: new URL(
          "../../../shared/image/src/file-inspection-process.ts",
          import.meta.url,
        ),
        producerUrls: {
          fixture: new URL(
            "./fixtures/asset-file-producer.ts",
            import.meta.url,
          ),
        },
        uploadUrl: new URL(
          "../../../shared/db/src/turso-worker/file-upload-process.ts",
          import.meta.url,
        ),
        downloadUrl: new URL(
          "../../../shared/db/src/turso-worker/file-download-process.ts",
          import.meta.url,
        ),
      },
      () => connection.abort(),
    );
    try {
      await files.withProducedFile(
        undefined,
        async (first) => {
          const firstRef = assetRefSchema.parse(
            `asset://sha256/${first.sha256}`,
          );
          const initial = createTestEntity("test", {
            id: "chunked",
            content: firstRef,
            visibility: "public",
          });
          await files.publish({
            sourceFile: first.sourceFile,
            sizeBytes: first.sizeBytes,
            publication: {
              operation: "createEntity",
              request: { entity: initial },
            },
          });
          expect(
            await files.withAssetFile(firstRef, async (file) => ({
              sizeBytes: file.sizeBytes,
              sha256: file.sha256,
            })),
          ).toEqual({ sizeBytes: 2 * 1024 * 1024 + 7, sha256: first.sha256 });
          await files.withProducedFile(
            undefined,
            async (second) => {
              const secondRef = assetRefSchema.parse(
                `asset://sha256/${second.sha256}`,
              );
              const entity = { ...initial, content: secondRef };
              await files.publish({
                sourceFile: second.sourceFile,
                sizeBytes: second.sizeBytes,
                publication: { operation: "updateEntity", request: { entity } },
              });
              expect(
                await files.withAssetFile(secondRef, async (file) => ({
                  sizeBytes: file.sizeBytes,
                  sha256: file.sha256,
                })),
              ).toEqual({ sizeBytes: first.sizeBytes, sha256: second.sha256 });
              expect(
                await files.publish({
                  sourceFile: second.sourceFile,
                  sizeBytes: second.sizeBytes,
                  publication: {
                    operation: "upsertEntity",
                    request: { entity: { ...entity, id: "upserted" } },
                  },
                }),
              ).toMatchObject({ created: true });
              await files.withProducedFile(
                undefined,
                async (rejected) => {
                  const rejectedRef = assetRefSchema.parse(
                    `asset://sha256/${rejected.sha256}`,
                  );
                  await assert.rejects(
                    files.publish({
                      sourceFile: rejected.sourceFile,
                      sizeBytes: rejected.sizeBytes,
                      publication: {
                        operation: "createEntity",
                        request: {
                          entity: { ...initial, content: rejectedRef },
                        },
                      },
                    }),
                  );
                  expect(await owner.statAsset(rejectedRef)).toBeNull();
                  expect(
                    (
                      await remote.getEntityRaw({
                        entityType: "test",
                        id: initial.id,
                      })
                    )?.content,
                  ).toBe(secondRef);
                  // An unreceived publication failure fences this connection. Never
                  // replay it or continue publishing on an uncertain transport.
                  await assert.rejects(client.offer(1), /fenced/);
                },
                { producer: "fixture", metadata: { fill: "3c" } },
              );
            },
            { producer: "fixture", metadata: { fill: "7f" } },
          );
        },
        { producer: "fixture", metadata: { fill: "a5" } },
      );
    } finally {
      await files.close();
    }
  });

  it("validates asset references and typed binary responses at the RPC boundary", () => {
    const asset = prepareAsset(new Uint8Array([0, 128, 255]));
    for (const operation of ["statAsset", "verifyAsset"] as const) {
      expect(parseEntityRpcRequest({ operation, ref: asset.ref })).toEqual({
        operation,
        ref: asset.ref,
      });
      expect(() =>
        parseEntityRpcRequest({ operation, ref: "file:/data/brain.db" }),
      ).toThrow();
    }
    const request = {
      operation: "readAssetChunk",
      ref: asset.ref,
      offset: 0,
      length: 3,
    } as const;
    expect(parseEntityRpcRequest(request)).toEqual(request);
    expect(() => parseEntityRpcRequest({ ...request, offset: -1 })).toThrow();
    expect(() =>
      parseEntityRpcRequest({ ...request, length: 16 * 1024 * 1024 }),
    ).toThrow();
    expect(parseEntityRpcResult(request, asset.bytes)).toEqual(asset.bytes);
    expect(() =>
      parseEntityRpcResult(request, Array.from(asset.bytes)),
    ).toThrow();
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
