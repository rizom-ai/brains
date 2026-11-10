import { describe, expect, it, mock } from "bun:test";
import type {
  ApplyProjectionRuleResultInput,
  GetProjectionRuleMemoInput,
  ProjectionDirtyInput,
  ProjectionRuleMemoValue,
  ProjectionWriteIntent,
  ProjectionWave,
  ProjectionWaveInput,
  ProjectionWaveRule,
} from "@brains/entity-service";
import {
  defineProjectionRule,
  type ProjectionExecutionContext,
  type ProjectionInputContext,
} from "@brains/plugins";
import { CallbackProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import {
  ProjectionRuleJobHandler,
  type ProjectionRuleDiagnostic,
  type ProjectionRuleExecutionStore,
  type ProjectionWaveCoordinator,
} from "../src/projection-rule-job-handler";

const inputContext: ProjectionInputContext = {
  entities: {
    getEntity: async () => null,
    listEntities: async () => [],
    getEntityTypes: () => [],
    hasEntityType: () => false,
    getEntityTypeConfig: () => ({}),
    isProjectionOwnedEntity: async () => false,
  },
  resolvePrompt: async (_reference, fallback) => fallback,
  appInfo: async () => {
    throw new Error("not used");
  },
  identityInput: () => ({}),
};

const executionContext: ProjectionExecutionContext = {
  get ai(): never {
    throw new Error("not used");
  },
  get logger(): never {
    throw new Error("not used");
  },
};

const progressReporter = CallbackProgressReporter.from(async () => {});
if (!progressReporter) throw new Error("Failed to create progress reporter");

class MemoryExecutionStore implements ProjectionRuleExecutionStore {
  readonly inputs: ProjectionWaveInput[];
  memo: ProjectionRuleMemoValue | null = null;
  applied: ApplyProjectionRuleResultInput | null = null;
  staleBeforeSelection = false;
  staleAtApply = false;
  waveStatus: ProjectionWave["status"] = "running";
  waveGraphFingerprint = "graph";
  waveCompletedAt: number | null = null;
  readonly supersededWaves: Array<{ waveId: string; supersededAt: number }> =
    [];
  /** The scheduler's sweep supersedes the wave right after a handler reads it. */
  sweepSupersedesAfterRead = false;

  constructor(inputCount: number) {
    this.inputs = Array.from({ length: inputCount }, (_unused, index) => ({
      waveId: "wave-1",
      sourceType: "document",
      sourceId: `document-${index}`,
      revision: `hash-${index}`,
      operation: "upsert",
      generation: index + 1,
    }));
  }

  getWave(): Promise<ProjectionWave> {
    const wave = this.currentWave();
    if (this.sweepSupersedesAfterRead && this.waveStatus === "running") {
      this.waveStatus = "superseded";
      this.waveCompletedAt = 15;
    }
    return Promise.resolve(wave);
  }

  supersedeWave(waveId: string, supersededAt: number): Promise<ProjectionWave> {
    // Like the durable store: only a running wave transitions, so a wave the
    // sweep already superseded comes back as the sweep left it.
    if (this.waveStatus === "running") {
      this.waveStatus = "superseded";
      this.waveCompletedAt = supersededAt;
      this.supersededWaves.push({ waveId, supersededAt });
    }
    return Promise.resolve(this.currentWave());
  }

  private currentWave(): ProjectionWave {
    return {
      id: "wave-1",
      cutoffGeneration: this.inputs.length,
      graphFingerprint: this.waveGraphFingerprint,
      admissionEpoch: 0,
      status: this.waveStatus,
      startedAt: 10,
      completedAt: this.waveCompletedAt,
    };
  }

  listPendingInputs(): Promise<ProjectionDirtyInput[]> {
    return Promise.resolve([]);
  }

  supersedeWaveIfStale(): Promise<boolean> {
    return Promise.resolve(this.staleBeforeSelection);
  }

  listWaveInputs(_waveId: string): Promise<ProjectionWaveInput[]> {
    return Promise.resolve(this.inputs);
  }

  listWaveRules(_waveId: string): Promise<ProjectionWaveRule[]> {
    return Promise.resolve([
      {
        waveId: "wave-1",
        ruleId: "topics",
        targetType: "topic",
        level: 0,
        jobId: "job-1",
        status: "queued",
        inputFingerprint: null,
        changedTargets: [],
      },
    ]);
  }

  getRuleMemo(
    _input: GetProjectionRuleMemoInput,
  ): Promise<ProjectionRuleMemoValue | null> {
    return Promise.resolve(this.memo);
  }

  applyRuleResult(
    input: ApplyProjectionRuleResultInput,
  ): Promise<ProjectionWaveRule | null> {
    this.applied = input;
    if (this.staleAtApply) return Promise.resolve(null);
    return Promise.resolve({
      waveId: input.waveId,
      ruleId: input.ruleId,
      targetType: "topic",
      level: 0,
      jobId: "job-1",
      status: "completed",
      inputFingerprint: input.inputFingerprint,
      changedTargets: input.writeIntents.map((intent) =>
        intent.operation === "upsert"
          ? {
              entityType: intent.entity.entityType,
              entityId: intent.entity.id,
              operation: "upsert" as const,
              contentHash: "output-hash",
            }
          : {
              entityType: intent.entityType,
              entityId: intent.id,
              operation: "delete" as const,
            },
      ),
    });
  }
}

class MemoryCoordinator implements ProjectionWaveCoordinator {
  readonly advancedWaveIds: string[] = [];
  readonly failedWaveIds: string[] = [];
  readonly continuedWaveIds: string[] = [];
  readonly incidents: Array<{
    waveId: string;
    ruleId: string;
    jobId: string | null;
    failureReason: string;
  }> = [];

  advanceActiveWave(waveId: string): Promise<unknown> {
    this.advancedWaveIds.push(waveId);
    return Promise.resolve();
  }

  failActiveWave(waveId: string): Promise<unknown> {
    this.failedWaveIds.push(waveId);
    return Promise.resolve();
  }

  continueAfterSupersession(waveId: string): Promise<unknown> {
    this.continuedWaveIds.push(waveId);
    return Promise.resolve();
  }

  failActiveWaveWithIncident(input: {
    waveId: string;
    ruleId: string;
    jobId: string | null;
    failureReason: string;
  }): Promise<unknown> {
    this.failedWaveIds.push(input.waveId);
    this.incidents.push(input);
    return Promise.resolve();
  }
}

describe("ProjectionRuleJobHandler", () => {
  it("selects one immutable input and derives once for an arbitrary dirty set", async () => {
    const derive = mock(async (): Promise<ProjectionWriteIntent[]> => [
      {
        operation: "delete",
        entityType: "topic",
        id: "stale-topic",
      },
    ]);
    const rule = defineProjectionRule({
      id: "topics",
      version: "1",
      sources: [{ kind: "entity", types: ["document"] }],
      targetType: "topic",
      inputSchema: z.object({ sourceCount: z.number().int() }),
      selectInput: async (trigger) => ({ sourceCount: trigger.inputs.length }),
      derive,
    });
    const store = new MemoryExecutionStore(100);
    const coordinator = new MemoryCoordinator();
    const reconcileTargets = mock(async () => {});
    const diagnostics: ProjectionRuleDiagnostic[] = [];
    const handler = new ProjectionRuleJobHandler({
      rules: [rule],
      store,
      coordinator,
      inputContext,
      executionContext,
      reconcileTargets,
      onDiagnostic: (diagnostic): void => {
        diagnostics.push(diagnostic);
      },
      graphFingerprint: "graph",
      now: (): number => 20,
    });

    await handler.process(
      { waveId: "wave-1", ruleId: "topics" },
      "job-1",
      progressReporter,
      new AbortController().signal,
    );

    expect(derive).toHaveBeenCalledTimes(1);
    expect(derive).toHaveBeenCalledWith(
      { sourceCount: 100 },
      executionContext,
      expect.any(AbortSignal),
    );
    expect(store.applied).toEqual(
      expect.objectContaining({
        waveId: "wave-1",
        ruleId: "topics",
        ruleVersion: "1",
        inputFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(reconcileTargets).toHaveBeenCalledWith([
      {
        entityType: "topic",
        entityId: "stale-topic",
        operation: "delete",
      },
    ]);
    expect(coordinator.advancedWaveIds).toEqual(["wave-1"]);
    expect(diagnostics.map(({ event }) => event)).toEqual([
      "attempt-started",
      "input-selected",
      "memo-resolved",
      "derive-started",
      "derive-completed",
      "apply-completed",
    ]);
    expect(diagnostics.at(-1)).toEqual(
      expect.objectContaining({
        waveId: "wave-1",
        ruleId: "topics",
        ruleVersion: "1",
        jobId: "job-1",
        attemptNumber: 1,
        cutoffGeneration: 100,
        selectedSourceCount: 100,
        memoHit: false,
        applyOutcome: "applied",
        highestPendingGeneration: null,
      }),
    );
  });

  it("skips selection and derive when the wave is already stale", async () => {
    const selectInput = mock(async () => ({ sourceCount: 1 }));
    const derive = mock(async () => []);
    const rule = defineProjectionRule({
      id: "topics",
      version: "1",
      sources: [{ kind: "entity", types: ["document"] }],
      targetType: "topic",
      inputSchema: z.object({ sourceCount: z.number() }),
      selectInput,
      derive,
    });
    const store = new MemoryExecutionStore(1);
    store.staleBeforeSelection = true;
    const coordinator = new MemoryCoordinator();
    const handler = new ProjectionRuleJobHandler({
      rules: [rule],
      store,
      coordinator,
      inputContext,
      executionContext,
      reconcileTargets: async (): Promise<void> => {},
      graphFingerprint: "graph",
      now: (): number => 20,
    });

    const result = await handler.process(
      { waveId: "wave-1", ruleId: "topics" },
      "job-1",
      progressReporter,
      new AbortController().signal,
    );

    expect(result.outcome).toBe("superseded");
    expect(selectInput).not.toHaveBeenCalled();
    expect(derive).not.toHaveBeenCalled();
    expect(coordinator.continuedWaveIds).toEqual(["wave-1"]);
  });

  it("treats another same-level job from an already superseded wave as complete", async () => {
    const selectInput = mock(async () => ({ sourceCount: 1 }));
    const rule = defineProjectionRule({
      id: "topics",
      version: "1",
      sources: [{ kind: "entity", types: ["document"] }],
      targetType: "topic",
      inputSchema: z.object({ sourceCount: z.number() }),
      selectInput,
      derive: async () => [],
    });
    const store = new MemoryExecutionStore(1);
    store.waveStatus = "superseded";
    const coordinator = new MemoryCoordinator();
    const handler = new ProjectionRuleJobHandler({
      rules: [rule],
      store,
      coordinator,
      inputContext,
      executionContext,
      reconcileTargets: async (): Promise<void> => {},
      graphFingerprint: "graph",
      now: (): number => 20,
    });

    const result = await handler.process(
      { waveId: "wave-1", ruleId: "topics" },
      "job-2",
      progressReporter,
      new AbortController().signal,
    );

    expect(result.outcome).toBe("superseded");
    expect(selectInput).not.toHaveBeenCalled();
    expect(coordinator.continuedWaveIds).toEqual([]);
    expect(coordinator.incidents).toEqual([]);
  });

  it("settles a superseded wave's job for a rule its plugin no longer provides", async () => {
    const store = new MemoryExecutionStore(1);
    store.waveStatus = "superseded";
    const coordinator = new MemoryCoordinator();
    const handler = new ProjectionRuleJobHandler({
      rules: [],
      store,
      coordinator,
      inputContext,
      executionContext,
      reconcileTargets: async (): Promise<void> => {},
      graphFingerprint: "graph",
      now: (): number => 20,
    });

    const result = await handler.process(
      { waveId: "wave-1", ruleId: "topics" },
      "job-removed-plugin",
      progressReporter,
      new AbortController().signal,
    );

    expect(result).toEqual({
      waveId: "wave-1",
      ruleId: "topics",
      outcome: "superseded",
      inputFingerprint: null,
      changedTargets: [],
    });
    expect(coordinator.continuedWaveIds).toEqual([]);
    expect(coordinator.incidents).toEqual([]);
  });

  it("supersedes a running wave on a retired graph when its rule left the composition", async () => {
    const store = new MemoryExecutionStore(1);
    store.waveGraphFingerprint = "retired-graph";
    const coordinator = new MemoryCoordinator();
    const handler = new ProjectionRuleJobHandler({
      rules: [],
      store,
      coordinator,
      inputContext,
      executionContext,
      reconcileTargets: async (): Promise<void> => {},
      graphFingerprint: "graph",
      now: (): number => 20,
    });

    const result = await handler.process(
      { waveId: "wave-1", ruleId: "topics" },
      "job-removed-plugin",
      progressReporter,
      new AbortController().signal,
    );

    expect(result).toEqual({
      waveId: "wave-1",
      ruleId: "topics",
      outcome: "superseded",
      inputFingerprint: null,
      changedTargets: [],
    });
    expect(store.supersededWaves).toEqual([
      { waveId: "wave-1", supersededAt: 20 },
    ]);
    expect(await store.getWave()).toEqual(
      expect.objectContaining({ status: "superseded", completedAt: 20 }),
    );
    expect(coordinator.continuedWaveIds).toEqual(["wave-1"]);
    expect(coordinator.incidents).toEqual([]);
  });

  it("settles as superseded when the sweep supersedes the retired-graph wave first", async () => {
    const store = new MemoryExecutionStore(1);
    store.waveGraphFingerprint = "retired-graph";
    store.sweepSupersedesAfterRead = true;
    const coordinator = new MemoryCoordinator();
    const handler = new ProjectionRuleJobHandler({
      rules: [],
      store,
      coordinator,
      inputContext,
      executionContext,
      reconcileTargets: async (): Promise<void> => {},
      graphFingerprint: "graph",
      now: (): number => 20,
    });

    const result = await handler.process(
      { waveId: "wave-1", ruleId: "topics" },
      "job-removed-plugin",
      progressReporter,
      new AbortController().signal,
    );

    expect(result).toEqual({
      waveId: "wave-1",
      ruleId: "topics",
      outcome: "superseded",
      inputFingerprint: null,
      changedTargets: [],
    });
    expect(store.supersededWaves).toEqual([]);
    expect(await store.getWave()).toEqual(
      expect.objectContaining({ status: "superseded", completedAt: 15 }),
    );
    expect(coordinator.continuedWaveIds).toEqual(["wave-1"]);
    expect(coordinator.incidents).toEqual([]);
  });

  it("refuses a running wave's job on the current graph for a rule that is not executable", async () => {
    const store = new MemoryExecutionStore(1);
    const handler = new ProjectionRuleJobHandler({
      rules: [],
      store,
      coordinator: new MemoryCoordinator(),
      inputContext,
      executionContext,
      reconcileTargets: async (): Promise<void> => {},
      graphFingerprint: "graph",
      now: (): number => 20,
    });

    const failure = await handler
      .process(
        { waveId: "wave-1", ruleId: "topics" },
        "job-unknown-rule",
        progressReporter,
        new AbortController().signal,
      )
      .catch((error: unknown) => error);

    expect(failure).toEqual(
      new Error('Projection rule "topics" is not executable'),
    );
    expect(store.supersededWaves).toEqual([]);
    expect(await store.getWave()).toEqual(
      expect.objectContaining({ status: "running" }),
    );
  });

  it("does not reconcile intents when the epoch changes during derive", async () => {
    const derive = mock(async (): Promise<ProjectionWriteIntent[]> => [
      { operation: "delete", entityType: "topic", id: "partial-topic" },
    ]);
    const rule = defineProjectionRule({
      id: "topics",
      version: "1",
      sources: [{ kind: "entity", types: ["document"] }],
      targetType: "topic",
      inputSchema: z.object({ sourceCount: z.number() }),
      selectInput: async (trigger) => ({ sourceCount: trigger.inputs.length }),
      derive,
    });
    const store = new MemoryExecutionStore(1);
    store.staleAtApply = true;
    const coordinator = new MemoryCoordinator();
    const reconcileTargets = mock(async (): Promise<void> => {});
    const handler = new ProjectionRuleJobHandler({
      rules: [rule],
      store,
      coordinator,
      inputContext,
      executionContext,
      reconcileTargets,
      graphFingerprint: "graph",
      now: (): number => 20,
    });

    const result = await handler.process(
      { waveId: "wave-1", ruleId: "topics" },
      "job-1",
      progressReporter,
      new AbortController().signal,
    );

    expect(result.outcome).toBe("superseded");
    expect(derive).toHaveBeenCalledTimes(1);
    expect(reconcileTargets).not.toHaveBeenCalled();
    expect(coordinator.advancedWaveIds).toEqual([]);
    expect(coordinator.continuedWaveIds).toEqual(["wave-1"]);
  });

  it("fails the active wave after terminal queue exhaustion", async () => {
    const rule = defineProjectionRule({
      id: "topics",
      version: "1",
      sources: [{ kind: "entity", types: ["document"] }],
      targetType: "topic",
      inputSchema: z.object({}),
      selectInput: async () => ({}),
      derive: async () => [],
    });
    const coordinator = new MemoryCoordinator();
    const handler = new ProjectionRuleJobHandler({
      rules: [rule],
      store: new MemoryExecutionStore(1),
      coordinator,
      inputContext,
      executionContext,
      reconcileTargets: async (): Promise<void> => {},
      graphFingerprint: "graph",
      now: (): number => 20,
    });

    await handler.onTerminalError(
      new Error("secret token must not be persisted"),
      {
        waveId: "wave-1",
        ruleId: "topics",
      },
      "job-terminal",
    );

    expect(coordinator.failedWaveIds).toEqual(["wave-1"]);
    expect(coordinator.incidents).toEqual([
      {
        waveId: "wave-1",
        ruleId: "topics",
        jobId: "job-terminal",
        failureReason: "Projection rule job exhausted retries",
      },
    ]);
  });

  it("replays a durable memo without deriving again", async () => {
    const derive = mock(async () => []);
    const rule = defineProjectionRule({
      id: "topics",
      version: "1",
      sources: [{ kind: "entity", types: ["document"] }],
      targetType: "topic",
      inputSchema: z.object({ sourceCount: z.number().int() }),
      selectInput: async (trigger) => ({ sourceCount: trigger.inputs.length }),
      derive,
    });
    const store = new MemoryExecutionStore(1);
    const fingerprint = rule.fingerprint({ sourceCount: 1 });
    store.memo = {
      ruleId: "topics",
      ruleVersion: "1",
      inputFingerprint: fingerprint,
      writeIntents: [
        { operation: "delete", entityType: "topic", id: "stale-topic" },
      ],
      createdAt: 10,
    };
    const handler = new ProjectionRuleJobHandler({
      rules: [rule],
      store,
      coordinator: new MemoryCoordinator(),
      inputContext,
      executionContext,
      reconcileTargets: async (): Promise<void> => {},
      graphFingerprint: "graph",
      now: (): number => 20,
    });

    await handler.process(
      { waveId: "wave-1", ruleId: "topics" },
      "job-1",
      progressReporter,
      new AbortController().signal,
    );

    expect(derive).not.toHaveBeenCalled();
    expect(store.applied?.writeIntents).toEqual(store.memo.writeIntents);
  });
});
