import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { ProjectionBatchFencedError, ProjectionStore } from "../src";
import { createEntityDatabase } from "../src/db";
import { entities } from "../src/schema/entities";
import {
  projectionBatchChildren,
  projectionBatches,
} from "../src/schema/projection-batches";
import { createTestEntityDatabase } from "./helpers/test-entity-db";

interface TestDatabase {
  cleanup: () => Promise<void>;
  config: { url: string };
}

describe("ProjectionStore", () => {
  let database: TestDatabase;
  let connection: ReturnType<typeof createEntityDatabase>;
  let store: ProjectionStore;

  beforeEach(async () => {
    database = await createTestEntityDatabase();
    connection = createEntityDatabase(database.config);
    store = new ProjectionStore(connection.db);
  });

  afterEach(async () => {
    connection.client.close();
    await database.cleanup();
  });

  it("commits an entity mutation and dirty revision together", async () => {
    await store.withDirtyInput(
      {
        sourceType: "document",
        sourceId: "doc-atomic",
        revision: "hash-atomic",
        operation: "upsert",
        markedAt: 10,
      },
      async (transaction) => {
        await transaction.insert(entities).values({
          id: "doc-atomic",
          entityType: "document",
          content: "content",
          contentHash: "hash-atomic",
          visibility: "public",
          metadata: {},
          created: 10,
          updated: 10,
        });
      },
    );

    expect(await connection.db.select().from(entities)).toHaveLength(1);
    expect(await store.listPendingInputs()).toEqual([
      expect.objectContaining({
        sourceId: "doc-atomic",
        revision: "hash-atomic",
      }),
    ]);
  });

  it("rolls back both the entity mutation and dirty revision", async () => {
    void expect(
      store.withDirtyInput(
        {
          sourceType: "document",
          sourceId: "doc-rollback",
          revision: "hash-rollback",
          operation: "upsert",
          markedAt: 10,
        },
        async (transaction) => {
          await transaction.insert(entities).values({
            id: "doc-rollback",
            entityType: "document",
            content: "content",
            contentHash: "hash-rollback",
            visibility: "public",
            metadata: {},
            created: 10,
            updated: 10,
          });
          throw new Error("force rollback");
        },
      ),
    ).rejects.toThrow("force rollback");

    expect(await connection.db.select().from(entities)).toEqual([]);
    expect(await store.listPendingInputs()).toEqual([]);
  });

  it("holds dirty generations behind one callback-scoped projection barrier", async () => {
    let claimedWhileOpen: unknown = "not checked";
    await store.runBulkMutation(
      { source: "directory-sync", operationId: "sync-1" },
      async () => {
        await Promise.all(
          ["doc-1", "doc-2"].map((sourceId, index) =>
            store.withDirtyInput(
              {
                sourceType: "document",
                sourceId,
                revision: `hash-${index + 1}`,
                operation: "upsert",
                markedAt: 10 + index,
              },
              async () => {},
            ),
          ),
        );
        claimedWhileOpen = await store.claimPendingWave({
          waveId: "wave-blocked",
          graphFingerprint: "graph-1",
          startedAt: 20,
        });
        expect(await store.getProjectionBatchDiagnostics()).toEqual({
          preparing: 0,
          open: 1,
          abandoned: 0,
          expiredCallbackLeases: 0,
          oldestActiveAgeMs: expect.any(Number),
          oldestProgressAgeMs: expect.any(Number),
        });
      },
    );

    expect(claimedWhileOpen).toBeNull();
    const wave = await store.claimPendingWave({
      waveId: "wave-settled",
      graphFingerprint: "graph-1",
      startedAt: 30,
    });
    expect(wave).toEqual(
      expect.objectContaining({
        id: "wave-settled",
        cutoffGeneration: 2,
        admissionEpoch: 1,
      }),
    );
    expect(await store.listWaveInputs("wave-settled")).toHaveLength(2);
  });

  it("keeps a callback barrier visible to a second database client", async () => {
    const secondConnection = createEntityDatabase(database.config);
    const secondStore = new ProjectionStore(secondConnection.db);
    try {
      await store.runBulkMutation(
        { source: "directory-sync", operationId: "sync-two-clients" },
        async () => {
          await secondStore.markDirty({
            sourceType: "document",
            sourceId: "doc-other-client",
            revision: "hash-other-client",
            operation: "upsert",
            markedAt: 10,
          });
          expect(
            await secondStore.claimPendingWave({
              waveId: "wave-other-client",
              graphFingerprint: "graph-1",
              startedAt: 20,
            }),
          ).toBeNull();
        },
      );
    } finally {
      secondConnection.client.close();
    }

    expect(
      await store.claimPendingWave({
        waveId: "wave-after-close",
        graphFingerprint: "graph-1",
        startedAt: 30,
      }),
    ).toEqual(expect.objectContaining({ id: "wave-after-close" }));
  });

  it("releases nested and exceptional callback scopes", async () => {
    void expect(
      store.runBulkMutation(
        { source: "directory-sync", operationId: "sync-nested" },
        async () => {
          await store.runBulkMutation(
            { source: "directory-sync", operationId: "sync-nested" },
            async () => {
              expect((await store.getProjectionBatchDiagnostics()).open).toBe(
                1,
              );
              await store.withDirtyInput(
                {
                  sourceType: "document",
                  sourceId: "doc-nested",
                  revision: "hash-nested",
                  operation: "upsert",
                  markedAt: 10,
                },
                async () => {},
              );
            },
          );
          throw new Error("cancel callback");
        },
      ),
    ).rejects.toThrow("cancel callback");

    expect((await store.getProjectionBatchDiagnostics()).open).toBe(0);
    expect(
      await store.claimPendingWave({
        waveId: "wave-after-error",
        graphFingerprint: "graph-1",
        startedAt: 30,
      }),
    ).toEqual(expect.objectContaining({ id: "wave-after-error" }));
  });

  it("fences an active wave result when a bulk boundary opens", async () => {
    await store.markDirty({
      sourceType: "document",
      sourceId: "doc-original",
      revision: "hash-original",
      operation: "upsert",
      markedAt: 10,
    });
    await store.claimPendingWave({
      waveId: "wave-stale",
      graphFingerprint: "graph-1",
      startedAt: 20,
    });
    await store.putWaveRules("wave-stale", [
      { ruleId: "topics", targetType: "topic", level: 0 },
    ]);

    await store.runBulkMutation(
      { source: "directory-sync", operationId: "sync-overlap" },
      async () => {
        await store.withDirtyInput(
          {
            sourceType: "note",
            sourceId: "note-new",
            revision: "hash-new",
            operation: "upsert",
            markedAt: 30,
          },
          async () => {},
        );
        expect(
          await store.applyRuleResult({
            waveId: "wave-stale",
            ruleId: "topics",
            ruleVersion: "1",
            inputFingerprint: "partial-input",
            writeIntents: [],
            completedAt: 40,
          }),
        ).toBeNull();
      },
    );

    expect(await store.getActiveWave()).toBeNull();
    expect(
      await store.getRuleMemo({
        ruleId: "topics",
        ruleVersion: "1",
        inputFingerprint: "partial-input",
      }),
    ).toBeNull();
    expect(await store.listPendingInputs()).toEqual([
      expect.objectContaining({ sourceId: "note-new" }),
      expect.objectContaining({ sourceId: "doc-original" }),
    ]);
  });

  it("keeps one durable barrier until every root-job child is terminal", async () => {
    await store.prepareDurableBulkMutation({
      source: "directory-sync",
      operationId: "root-batch-1",
      rootJobId: "root-batch-1",
      expectedChildren: 2,
    });
    expect(
      await store.claimPendingWave({
        waveId: "wave-during-enqueue",
        graphFingerprint: "graph-1",
        startedAt: 5,
      }),
    ).toBeNull();
    await store.finalizeDurableBulkMutationEnqueue("root-batch-1");

    const runChild = async (
      childKey: string,
      jobId: string,
      sourceId: string,
    ): Promise<void> => {
      await store.runDurableBulkMutationChild(
        {
          source: "directory-sync",
          operationId: "root-batch-1",
          rootJobId: "root-batch-1",
          childKey,
          expectedChildren: 2,
          jobId,
        },
        () =>
          store.withDirtyInput(
            {
              sourceType: "document",
              sourceId,
              revision: `hash-${sourceId}`,
              operation: "upsert",
              markedAt: 10,
            },
            async () => {},
          ),
      );
    };

    await runChild("0:directory-import", "job-1", "doc-1");
    await runChild("1:directory-import", "job-2", "doc-2");
    expect(
      await store.claimPendingWave({
        waveId: "wave-before-terminal",
        graphFingerprint: "graph-1",
        startedAt: 20,
      }),
    ).toBeNull();

    expect(
      await store.settleDurableBulkMutationChild({
        operationId: "root-batch-1",
        childKey: "0:directory-import",
        jobId: "job-1",
        outcome: "completed",
      }),
    ).toBe(false);
    expect((await store.getProjectionBatchDiagnostics()).open).toBe(1);
    expect(
      await store.settleDurableBulkMutationChild({
        operationId: "root-batch-1",
        childKey: "1:directory-import",
        jobId: "job-2",
        outcome: "failed",
      }),
    ).toBe(true);
    expect((await store.getProjectionBatchDiagnostics()).open).toBe(0);

    expect(
      await store.claimPendingWave({
        waveId: "wave-after-terminal",
        graphFingerprint: "graph-1",
        startedAt: 30,
      }),
    ).toEqual(
      expect.objectContaining({
        id: "wave-after-terminal",
        admissionEpoch: 1,
      }),
    );
  });

  it("fences an expired callback owner before releasing its barrier", async () => {
    let now = 0;
    const ownedStore = new ProjectionStore(connection.db, undefined, () => now);
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const running = ownedStore.runBulkMutation(
      { source: "directory-sync", operationId: "expired-callback" },
      async () => {
        await ownedStore.withDirtyInput(
          {
            sourceType: "document",
            sourceId: "completed-before-stall",
            revision: "completed-hash",
            operation: "upsert",
            markedAt: now,
          },
          async () => {},
        );
        entered?.();
        await blocked;
        await ownedStore.withDirtyInput(
          {
            sourceType: "document",
            sourceId: "stale-owner-write",
            revision: "stale-hash",
            operation: "upsert",
            markedAt: now,
          },
          async () => {},
        );
      },
    );
    await started;
    expect(await ownedStore.recoverProjectionBatches(async () => [])).toEqual({
      fencedCallbacks: 0,
      releasedDurableRoots: 0,
    });

    now = 30_001;
    expect(await ownedStore.recoverProjectionBatches(async () => [])).toEqual({
      fencedCallbacks: 1,
      releasedDurableRoots: 0,
    });
    release?.();
    const failure = await running.then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ProjectionBatchFencedError);
    expect(await ownedStore.listPendingInputs()).toEqual([
      expect.objectContaining({ sourceId: "completed-before-stall" }),
    ]);
    expect(await ownedStore.getProjectionBatchDiagnostics()).toEqual(
      expect.objectContaining({ open: 0, abandoned: 1 }),
    );
  });

  it("checks an active projection barrier without taking the write lock", async () => {
    await store.markDirty({
      sourceType: "document",
      sourceId: "blocked-wave-source",
      revision: "blocked-wave-revision",
      operation: "upsert",
      markedAt: 10,
    });
    await store.prepareDurableBulkMutation({
      source: "directory-sync",
      operationId: "write-locked-root",
      rootJobId: "write-locked-root",
      expectedChildren: 1,
    });
    await store.finalizeDurableBulkMutationEnqueue("write-locked-root");

    const blockerConnection = createEntityDatabase(database.config);
    const blocker = await blockerConnection.client.transaction("write");
    try {
      expect(
        await store.claimPendingWave({
          waveId: "write-locked-wave",
          graphFingerprint: "graph-1",
          startedAt: 20,
        }),
      ).toBeNull();
    } finally {
      await blocker.rollback();
      blockerConnection.client.close();
    }
  });

  it("leaves a live durable root read-only during recovery", async () => {
    await store.prepareDurableBulkMutation({
      source: "directory-sync",
      operationId: "live-root",
      rootJobId: "live-root",
      expectedChildren: 1,
    });
    await store.finalizeDurableBulkMutationEnqueue("live-root");

    expect(
      await store.recoverProjectionBatches(async () => [
        {
          jobId: "live-job",
          childKey: "0:directory-import",
          status: "processing",
          terminalAt: null,
        },
      ]),
    ).toEqual({ fencedCallbacks: 0, releasedDurableRoots: 0 });
    expect(await connection.db.select().from(projectionBatchChildren)).toEqual(
      [],
    );
  });

  it("reconciles terminal durable children after a worker callback is lost", async () => {
    let now = 0;
    const recoveryStore = new ProjectionStore(
      connection.db,
      undefined,
      () => now,
    );
    await recoveryStore.runDurableBulkMutationChild(
      {
        source: "directory-sync",
        operationId: "lost-terminal-callback",
        rootJobId: "root-lost-callback",
        childKey: "0:directory-import",
        expectedChildren: 1,
        jobId: "job-lost-callback",
      },
      () =>
        recoveryStore.withDirtyInput(
          {
            sourceType: "document",
            sourceId: "doc-recovered-root",
            revision: "hash-recovered-root",
            operation: "upsert",
            markedAt: now,
          },
          async () => {},
        ),
    );

    now = 100;
    expect(
      await recoveryStore.recoverProjectionBatches(async () => [
        {
          jobId: "job-lost-callback",
          childKey: "0:directory-import",
          status: "completed",
          terminalAt: now,
        },
      ]),
    ).toEqual({ fencedCallbacks: 0, releasedDurableRoots: 0 });
    now = 5_101;
    expect(
      await recoveryStore.recoverProjectionBatches(async () => [
        {
          jobId: "job-lost-callback",
          childKey: "0:directory-import",
          status: "completed",
          terminalAt: 100,
        },
      ]),
    ).toEqual({ fencedCallbacks: 0, releasedDurableRoots: 1 });
    expect(
      await recoveryStore.claimPendingWave({
        waveId: "wave-worker-recovered",
        graphFingerprint: "graph-1",
        startedAt: now,
      }),
    ).toEqual(expect.objectContaining({ id: "wave-worker-recovered" }));
  });

  it("abandons a partial durable enqueue only after its bound jobs settle", async () => {
    let now = 0;
    const partialStore = new ProjectionStore(
      connection.db,
      undefined,
      () => now,
    );
    await partialStore.prepareDurableBulkMutation({
      source: "directory-sync",
      operationId: "partial-root",
      rootJobId: "partial-root",
      expectedChildren: 2,
    });
    await partialStore.runDurableBulkMutationChild(
      {
        source: "directory-sync",
        operationId: "partial-root",
        rootJobId: "partial-root",
        childKey: "0:directory-import",
        expectedChildren: 2,
        jobId: "partial-job-1",
      },
      () =>
        partialStore.withDirtyInput(
          {
            sourceType: "document",
            sourceId: "partial-doc",
            revision: "partial-hash",
            operation: "upsert",
            markedAt: now,
          },
          async () => {},
        ),
    );
    await partialStore.failDurableBulkMutationEnqueue("partial-root");

    const terminalJobs = async (): Promise<
      Array<{
        jobId: string;
        childKey: string;
        status: "completed";
        terminalAt: number;
      }>
    > => [
      {
        jobId: "partial-job-1",
        childKey: "0:directory-import",
        status: "completed",
        terminalAt: 0,
      },
    ];
    expect(await partialStore.recoverProjectionBatches(terminalJobs)).toEqual({
      fencedCallbacks: 0,
      releasedDurableRoots: 0,
    });
    now = 30_001;
    expect(await partialStore.recoverProjectionBatches(terminalJobs)).toEqual({
      fencedCallbacks: 0,
      releasedDurableRoots: 1,
    });
    expect(await partialStore.getProjectionBatchDiagnostics()).toEqual(
      expect.objectContaining({ open: 0, preparing: 0, abandoned: 1 }),
    );
  });

  it("bounds retained terminal projection batch records by age and count", async () => {
    let now = 0;
    const retentionStore = new ProjectionStore(
      connection.db,
      undefined,
      () => now,
    );
    for (let index = 0; index < 3; index++) {
      await retentionStore.runBulkMutation(
        { source: "directory-sync", operationId: `retention-${index}` },
        async () => {},
      );
    }

    expect(await retentionStore.cleanupProjectionBatches(1_000_000, 2)).toBe(1);
    expect(await connection.db.select().from(projectionBatches)).toHaveLength(
      2,
    );
    now = 1_000_001;
    expect(await retentionStore.cleanupProjectionBatches(1_000_000, 100)).toBe(
      2,
    );
    expect(await connection.db.select().from(projectionBatches)).toEqual([]);
  });

  it("keeps only the latest pending revision for each scheduling input", async () => {
    const firstGeneration = await store.markDirty({
      sourceType: "document",
      sourceId: "doc-1",
      revision: "hash-1",
      operation: "upsert",
      markedAt: 10,
    });
    const secondGeneration = await store.markDirty({
      sourceType: "document",
      sourceId: "doc-1",
      revision: "hash-2",
      operation: "upsert",
      markedAt: 20,
    });
    await store.markDirty({
      sourceType: "topic",
      sourceId: "topic-1",
      revision: "hash-topic",
      operation: "upsert",
      markedAt: 30,
    });

    expect(secondGeneration).toBeGreaterThan(firstGeneration);
    expect(await store.listPendingInputs()).toEqual([
      {
        sourceType: "document",
        sourceId: "doc-1",
        revision: "hash-2",
        operation: "upsert",
        generation: secondGeneration,
        markedAt: 20,
      },
      expect.objectContaining({
        sourceType: "topic",
        sourceId: "topic-1",
        revision: "hash-topic",
      }),
    ]);
  });

  it("coalesces a claimed generation while newer ingress remains pending", async () => {
    await store.markDirty({
      sourceType: "document",
      sourceId: "doc-1",
      revision: "hash-obsolete",
      operation: "upsert",
      markedAt: 5,
    });
    const claimedGeneration = await store.markDirty({
      sourceType: "document",
      sourceId: "doc-1",
      revision: "hash-1",
      operation: "upsert",
      markedAt: 10,
    });

    const wave = await store.claimPendingWave({
      waveId: "wave-1",
      graphFingerprint: "graph-1",
      startedAt: 20,
    });
    const successorGeneration = await store.markDirty({
      sourceType: "document",
      sourceId: "doc-1",
      revision: "hash-2",
      operation: "upsert",
      markedAt: 30,
    });

    expect(wave).toEqual({
      id: "wave-1",
      cutoffGeneration: claimedGeneration,
      graphFingerprint: "graph-1",
      admissionEpoch: 0,
      status: "running",
      startedAt: 20,
      completedAt: null,
    });
    expect(await store.listWaveInputs("wave-1")).toEqual([
      {
        waveId: "wave-1",
        sourceType: "document",
        sourceId: "doc-1",
        revision: "hash-1",
        operation: "upsert",
        generation: claimedGeneration,
      },
    ]);
    expect(await store.listPendingInputs()).toEqual([
      expect.objectContaining({
        sourceId: "doc-1",
        revision: "hash-2",
        generation: successorGeneration,
      }),
    ]);
  });

  it("does not create an empty wave", async () => {
    expect(
      await store.claimPendingWave({
        waveId: "wave-empty",
        graphFingerprint: "graph-1",
        startedAt: 20,
      }),
    ).toBeNull();
  });

  it("recovers a failed wave without replacing newer pending ingress", async () => {
    await store.markDirty({
      sourceType: "document",
      sourceId: "doc-newer",
      revision: "hash-claimed",
      operation: "upsert",
      markedAt: 10,
    });
    await store.markDirty({
      sourceType: "document",
      sourceId: "doc-requeue",
      revision: "hash-requeue",
      operation: "upsert",
      markedAt: 11,
    });
    const wave = await store.claimPendingWave({
      waveId: "wave-failed",
      graphFingerprint: "graph-1",
      startedAt: 20,
    });
    await store.markDirty({
      sourceType: "document",
      sourceId: "doc-newer",
      revision: "hash-newer",
      operation: "upsert",
      markedAt: 30,
    });

    expect(await store.getActiveWave()).toEqual(wave);
    await store.failWave("wave-failed", 40);

    expect(await store.getActiveWave()).toBeNull();
    expect(await store.listPendingInputs()).toEqual([
      expect.objectContaining({
        sourceId: "doc-newer",
        revision: "hash-newer",
        markedAt: 30,
      }),
      expect.objectContaining({
        sourceId: "doc-requeue",
        revision: "hash-requeue",
        markedAt: 40,
      }),
    ]);
  });

  it("persists idempotent incidents, bounds details, and resolves by coverage", async () => {
    await store.markDirty({
      sourceType: "document",
      sourceId: "doc-incident",
      revision: "hash-1",
      operation: "upsert",
      markedAt: 10,
    });
    await store.claimPendingWave({
      waveId: "wave-failed",
      graphFingerprint: "graph-1",
      startedAt: 20,
    });
    await store.putWaveRules("wave-failed", [
      { ruleId: "topics", targetType: "topic", level: 0 },
    ]);
    await store.queueWaveRule("wave-failed", "topics", "job-terminal");

    await store.failWaveWithIncident({
      waveId: "wave-failed",
      ruleId: "topics",
      jobId: "job-terminal",
      failureReason: "Projection rule job exhausted retries",
      failedAt: 30,
    });
    await store.failWaveWithIncident({
      waveId: "wave-failed",
      ruleId: "topics",
      jobId: "job-terminal",
      failureReason: "must remain idempotent",
      failedAt: 31,
    });

    expect(await store.getUnresolvedProjectionIncidentDiagnostics()).toEqual({
      total: 1,
      incidents: [
        {
          waveId: "wave-failed",
          ruleId: "topics",
          jobId: "job-terminal",
          failureReason: "Projection rule job exhausted retries",
          recoveryGeneration: 2,
          createdAt: 30,
          resolvedAt: null,
        },
      ],
    });

    const restartedStore = new ProjectionStore(connection.db);
    expect(
      (await restartedStore.getUnresolvedProjectionIncidentDiagnostics()).total,
    ).toBe(1);

    await store.claimPendingWave({
      waveId: "wave-failed-again",
      graphFingerprint: "graph-1",
      startedAt: 4,
    });
    await store.putWaveRules("wave-failed-again", [
      { ruleId: "topics", targetType: "topic", level: 0 },
    ]);
    await store.queueWaveRule(
      "wave-failed-again",
      "topics",
      "job-terminal-again",
    );
    await store.failWaveWithIncident({
      waveId: "wave-failed-again",
      ruleId: "topics",
      jobId: "job-terminal-again",
      failureReason: "Projection rule job exhausted retries again",
      failedAt: 35,
    });

    expect(await store.getUnresolvedProjectionIncidentDiagnostics(1)).toEqual({
      total: 2,
      incidents: [
        expect.objectContaining({
          waveId: "wave-failed-again",
          recoveryGeneration: 3,
        }),
      ],
    });

    await store.claimPendingWave({
      waveId: "wave-recovery",
      graphFingerprint: "graph-1",
      // Deliberately skew the clock behind failedAt: generation coverage, not
      // wall-clock ordering, proves that this wave replayed the inputs.
      startedAt: 5,
    });
    await store.completeWave("wave-recovery", 50);

    expect(await store.getUnresolvedProjectionIncidentDiagnostics()).toEqual({
      total: 0,
      incidents: [],
    });
  });

  it("atomically stores a memo, canonical writes, and rule outcome", async () => {
    await store.markDirty({
      sourceType: "document",
      sourceId: "doc-1",
      revision: "hash-1",
      operation: "upsert",
      markedAt: 10,
    });
    await store.claimPendingWave({
      waveId: "wave-apply",
      graphFingerprint: "graph-1",
      startedAt: 20,
    });
    await store.putWaveRules("wave-apply", [
      { ruleId: "topics", targetType: "topic", level: 0 },
    ]);
    expect(await store.queueWaveRule("wave-apply", "topics", "job-1")).toEqual(
      expect.objectContaining({ status: "queued", jobId: "job-1" }),
    );
    void expect(store.completeWave("wave-apply", 25)).rejects.toThrow(
      "incomplete projection rules",
    );

    const outcome = await store.applyRuleResult({
      waveId: "wave-apply",
      ruleId: "topics",
      ruleVersion: "1",
      inputFingerprint: "input-1",
      writeIntents: [
        {
          operation: "upsert",
          entity: {
            id: "topic-1",
            entityType: "topic",
            content: "# Topic",
            metadata: { title: "Topic" },
            visibility: "public",
          },
        },
      ],
      completedAt: 30,
    });
    if (!outcome)
      throw new Error("Projection wave was unexpectedly superseded");

    expect(outcome).toEqual({
      waveId: "wave-apply",
      ruleId: "topics",
      targetType: "topic",
      level: 0,
      jobId: "job-1",
      status: "completed",
      inputFingerprint: "input-1",
      changedTargets: [
        {
          entityType: "topic",
          entityId: "topic-1",
          operation: "upsert",
          contentHash: expect.any(String),
        },
      ],
    });
    expect(await connection.db.select().from(entities)).toEqual([
      expect.objectContaining({
        id: "topic-1",
        entityType: "topic",
        content: "# Topic",
        metadata: { title: "Topic" },
      }),
    ]);
    expect(
      await store.getRuleMemo({
        ruleId: "topics",
        ruleVersion: "1",
        inputFingerprint: "input-1",
      }),
    ).toEqual(
      expect.objectContaining({
        writeIntents: [expect.objectContaining({ operation: "upsert" })],
      }),
    );
    expect(await store.getWaveRule("wave-apply", "topics")).toEqual(outcome);
    expect(await store.listWaveRules("wave-apply")).toEqual([outcome]);
    expect(await store.completeWave("wave-apply", 40)).toEqual(
      expect.objectContaining({
        id: "wave-apply",
        status: "completed",
        completedAt: 40,
      }),
    );
    expect(await store.getActiveWave()).toBeNull();
  });

  it("accepts late queue bookkeeping after a fast rule completes", async () => {
    await store.markDirty({
      sourceType: "document",
      sourceId: "document-fast",
      revision: "hash-fast",
      operation: "upsert",
      markedAt: 10,
    });
    await store.claimPendingWave({
      waveId: "wave-fast",
      graphFingerprint: "graph-1",
      startedAt: 20,
    });
    await store.putWaveRules("wave-fast", [
      { ruleId: "topics", targetType: "topic", level: 0 },
    ]);
    const completed = await store.applyRuleResult({
      waveId: "wave-fast",
      ruleId: "topics",
      ruleVersion: "1",
      inputFingerprint: "input-fast",
      writeIntents: [],
      completedAt: 30,
    });
    if (!completed) {
      throw new Error("Projection wave was unexpectedly superseded");
    }

    expect(
      await store.queueWaveRule("wave-fast", "topics", "job-fast"),
    ).toEqual(completed);
  });

  it("rejects rule writes outside the scheduler-authorized target type", async () => {
    await store.markDirty({
      sourceType: "document",
      sourceId: "doc-1",
      revision: "hash-1",
      operation: "upsert",
      markedAt: 10,
    });
    await store.claimPendingWave({
      waveId: "wave-target",
      graphFingerprint: "graph-1",
      startedAt: 20,
    });
    await store.putWaveRules("wave-target", [
      { ruleId: "topics", targetType: "topic", level: 0 },
    ]);

    void expect(
      store.applyRuleResult({
        waveId: "wave-target",
        ruleId: "topics",
        ruleVersion: "1",
        inputFingerprint: "input-target",
        writeIntents: [
          {
            operation: "delete",
            entityType: "skill",
            id: "skill-1",
          },
        ],
        completedAt: 30,
      }),
    ).rejects.toThrow('cannot write entity type "skill"');

    expect(await store.getWaveRule("wave-target", "topics")).toEqual(
      expect.objectContaining({ status: "pending" }),
    );
    expect(
      await store.getRuleMemo({
        ruleId: "topics",
        ruleVersion: "1",
        inputFingerprint: "input-target",
      }),
    ).toBeNull();
  });

  it("rolls back memo and writes when rule outcome persistence fails", async () => {
    await store.markDirty({
      sourceType: "document",
      sourceId: "doc-1",
      revision: "hash-1",
      operation: "upsert",
      markedAt: 10,
    });
    await store.claimPendingWave({
      waveId: "wave-rollback",
      graphFingerprint: "graph-1",
      startedAt: 20,
    });
    await store.putWaveRules("wave-rollback", [
      { ruleId: "topics", targetType: "topic", level: 0 },
    ]);
    await connection.db.run(sql`
      CREATE TRIGGER reject_projection_rule_outcome
      BEFORE UPDATE ON projection_wave_rules
      BEGIN
        SELECT RAISE(ABORT, 'forced outcome failure');
      END
    `);

    void expect(
      store.applyRuleResult({
        waveId: "wave-rollback",
        ruleId: "topics",
        ruleVersion: "1",
        inputFingerprint: "input-rollback",
        writeIntents: [
          {
            operation: "upsert",
            entity: {
              id: "topic-rollback",
              entityType: "topic",
              content: "# Topic",
              metadata: {},
              visibility: "public",
            },
          },
        ],
        completedAt: 30,
      }),
    ).rejects.toThrow();

    expect(await connection.db.select().from(entities)).toEqual([]);
    expect(
      await store.getRuleMemo({
        ruleId: "topics",
        ruleVersion: "1",
        inputFingerprint: "input-rollback",
      }),
    ).toBeNull();
    expect(await store.getWaveRule("wave-rollback", "topics")).toEqual(
      expect.objectContaining({ status: "pending" }),
    );
  });
});
