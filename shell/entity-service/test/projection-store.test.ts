import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { ProjectionStore } from "../src";
import { createEntityDatabase } from "../src/db";
import { entities } from "../src/schema/entities";
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
