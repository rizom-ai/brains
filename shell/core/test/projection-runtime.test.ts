import { describe, expect, it } from "bun:test";
import type {
  ApplyProjectionRuleResultInput,
  ClaimProjectionWaveInput,
  GetProjectionRuleMemoInput,
  ProjectionDirtyInput,
  ProjectionIncidentInput,
  ProjectionRuleMemoValue,
  ProjectionWave,
  ProjectionWaveInput,
  ProjectionWaveRule,
  ProjectionWaveRuleInput,
} from "@brains/entity-service";
import type { JobHandler, JobQueueEnqueueRequest } from "@brains/job-queue";
import {
  defineProjectionRule,
  type ProjectionExecutionContext,
  type ProjectionGraph,
  type ProjectionInputContext,
} from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  activateProjectionRuntime,
  type ProjectionRuntimeStore,
} from "../src/projection-runtime";
import { PROJECTION_RULE_JOB_TYPE } from "../src/projection-wave-scheduler";

class MemoryRuntimeStore implements ProjectionRuntimeStore {
  private active: ProjectionWave | null = null;
  private pending = true;
  private rules: ProjectionWaveRule[] = [];
  setPending(pending: boolean): void {
    this.pending = pending;
  }

  getWave(waveId: string): Promise<ProjectionWave | null> {
    return Promise.resolve(this.active?.id === waveId ? this.active : null);
  }

  getActiveWave(): Promise<ProjectionWave | null> {
    return Promise.resolve(this.active);
  }

  listPendingInputs(): Promise<ProjectionDirtyInput[]> {
    return Promise.resolve(
      this.pending
        ? [
            {
              generation: 1,
              sourceType: "document",
              sourceId: "document-1",
              revision: "revision-1",
              operation: "upsert",
              markedAt: 0,
            },
          ]
        : [],
    );
  }

  claimPendingWave(
    input: ClaimProjectionWaveInput,
  ): Promise<ProjectionWave | null> {
    if (!this.pending) return Promise.resolve(null);
    this.pending = false;
    this.active = {
      id: input.waveId,
      cutoffGeneration: 1,
      graphFingerprint: input.graphFingerprint,
      admissionEpoch: 0,
      status: "running",
      startedAt: input.startedAt,
      completedAt: null,
    };
    return Promise.resolve(this.active);
  }

  listWaveInputs(waveId: string): Promise<ProjectionWaveInput[]> {
    return Promise.resolve([
      {
        waveId,
        sourceType: "document",
        sourceId: "document-1",
        revision: "revision-1",
        operation: "upsert",
        generation: 1,
      },
    ]);
  }

  putWaveRules(
    waveId: string,
    rules: readonly ProjectionWaveRuleInput[],
  ): Promise<void> {
    this.rules = rules.map((rule) => ({
      waveId,
      ...rule,
      jobId: null,
      status: "pending",
      inputFingerprint: null,
      changedTargets: [],
    }));
    return Promise.resolve();
  }

  listWaveRules(): Promise<ProjectionWaveRule[]> {
    return Promise.resolve(this.rules);
  }

  async queueWaveRule(
    waveId: string,
    ruleId: string,
    jobId: string,
  ): Promise<ProjectionWaveRule> {
    const current = this.rules.find((rule) => rule.ruleId === ruleId);
    if (!current) throw new Error("missing rule");
    const queued: ProjectionWaveRule = {
      ...current,
      waveId,
      jobId,
      status: "queued",
    };
    this.rules = this.rules.map((rule) =>
      rule.ruleId === ruleId ? queued : rule,
    );
    return queued;
  }

  failWave(_waveId: string, failedAt: number): Promise<ProjectionWave> {
    if (!this.active) throw new Error("missing wave");
    const failed: ProjectionWave = {
      ...this.active,
      status: "failed",
      completedAt: failedAt,
    };
    this.active = null;
    this.pending = true;
    return Promise.resolve(failed);
  }

  failWaveWithIncident(
    input: ProjectionIncidentInput,
  ): Promise<ProjectionWave> {
    return this.failWave(input.waveId, input.failedAt);
  }

  completeWave(_waveId: string, completedAt: number): Promise<ProjectionWave> {
    if (!this.active) throw new Error("missing wave");
    const completed: ProjectionWave = {
      ...this.active,
      status: "completed",
      completedAt,
    };
    this.active = null;
    return Promise.resolve(completed);
  }

  supersedeWaveIfStale(): Promise<boolean> {
    return Promise.resolve(false);
  }

  getRuleMemo(
    _input: GetProjectionRuleMemoInput,
  ): Promise<ProjectionRuleMemoValue | null> {
    return Promise.resolve(null);
  }

  applyRuleResult(
    _input: ApplyProjectionRuleResultInput,
  ): Promise<ProjectionWaveRule> {
    throw new Error("not used by activation test");
  }
}

const projectionRule = defineProjectionRule({
  id: "document-summary",
  version: "1",
  targetType: "summary",
  sources: [{ kind: "entity", types: ["document"] }],
  inputSchema: z.object({}),
  selectInput: async () => ({}),
  derive: async () => [],
});

const graph: ProjectionGraph = {
  projections: [
    {
      id: projectionRule.id,
      pluginId: "summary",
      targetType: projectionRule.targetType,
      sources: [{ kind: "entity", types: ["document"] }],
    },
  ],
  edges: [],
  unknownSourceTypes: [],
};

const inputContext: ProjectionInputContext = {
  entities: {
    getEntity: async () => null,
    listEntities: async () => [],
    getEntityTypes: () => [],
    hasEntityType: () => false,
    getEntityTypeConfig: () => ({}),
  },
  resolvePrompt: async (_reference, fallback) => fallback,
  appInfo: async () => ({
    model: "test",
    version: "1",
    uptime: 0,
    entities: 0,
    entityCounts: [],
    embeddings: 0,
    backgroundWork: {
      status: "operational",
      reasons: [],
      worker: {
        state: "active",
        activeSessions: 1,
        staleSessions: 0,
        latestHeartbeatAgeMs: 0,
      },
      queue: {
        duePending: 0,
        processing: 0,
        oldestDuePendingAgeMs: null,
        latestClaimAgeMs: null,
        stalled: false,
      },
    },
    ai: { model: "test", embeddingModel: "test" },
    daemons: [],
    endpoints: [],
    interactions: [],
  }),
  identityInput: () => ({}),
};

const executionContext: ProjectionExecutionContext = {
  ai: {
    query: async () => ({ message: "" }),
    generate: async <T>(): Promise<T> => {
      throw new Error("not used by activation test");
    },
    generateObject: async <T>(): Promise<{ object: T }> => {
      throw new Error("not used by activation test");
    },
    generateImage: async () => ({ base64: "", dataUrl: "" }),
  },
  logger: createSilentLogger(),
};

describe("activateProjectionRuntime", () => {
  it("sweeps worker-unblocked ingress without a web-role mutation", async () => {
    const store = new MemoryRuntimeStore();
    store.setPending(false);
    const requests: JobQueueEnqueueRequest[] = [];
    let scheduledSweep: (() => Promise<void>) | undefined;
    let sweepCancelled = false;
    let reconciliations = 0;
    const runtime = await activateProjectionRuntime({
      store,
      queue: {
        enqueue: async (request): Promise<string> => {
          requests.push(request);
          return "job-swept";
        },
        getStatus: async () => null,
        registerHandler: (): void => {},
        unregisterHandler: (): void => {},
      },
      setWakeup: (): (() => void) => () => {},
      graph,
      rules: [projectionRule],
      inputContext,
      executionContext,
      reconcileTargets: async () => {},
      beforeWaveCompletion: async () => {},
      logger: createSilentLogger(),
      createWaveId: () => "wave-swept",
      now: () => 10,
      reconcileBatches: async (): Promise<void> => {
        reconciliations++;
        if (reconciliations === 2) store.setPending(true);
      },
      scheduleSweep: (_intervalMs, sweep): (() => void) => {
        scheduledSweep = sweep;
        return (): void => {
          sweepCancelled = true;
        };
      },
    });

    expect(requests).toEqual([]);
    await scheduledSweep?.();
    expect(requests.map(({ data }) => data)).toEqual([
      { waveId: "wave-swept", ruleId: "document-summary" },
    ]);

    runtime.dispose();
    expect(sweepCancelled).toBe(true);
  });

  it("does not overlap projection coordination sweeps", async () => {
    const store = new MemoryRuntimeStore();
    store.setPending(false);
    let scheduledSweep: (() => Promise<void>) | undefined;
    let reconciliations = 0;
    let releaseReconciliation = (): void => {};
    const blockedReconciliation = new Promise<void>((resolve) => {
      releaseReconciliation = resolve;
    });
    let markReconciliationStarted = (): void => {};
    const reconciliationStarted = new Promise<void>((resolve) => {
      markReconciliationStarted = resolve;
    });
    const runtime = await activateProjectionRuntime({
      store,
      queue: {
        enqueue: async () => "unused",
        getStatus: async () => null,
        registerHandler: (): void => {},
        unregisterHandler: (): void => {},
      },
      setWakeup: (): (() => void) => () => {},
      graph,
      rules: [projectionRule],
      inputContext,
      executionContext,
      reconcileTargets: async () => {},
      beforeWaveCompletion: async () => {},
      logger: createSilentLogger(),
      createWaveId: () => "unused-wave",
      now: () => 10,
      reconcileBatches: async (): Promise<void> => {
        reconciliations++;
        if (reconciliations !== 2) return;
        markReconciliationStarted();
        await blockedReconciliation;
      },
      scheduleSweep: (_intervalMs, sweep): (() => void) => {
        scheduledSweep = sweep;
        return (): void => {};
      },
    });

    const first = scheduledSweep?.();
    await reconciliationStarted;
    const overlapping = scheduledSweep?.();
    await Promise.resolve();
    expect(reconciliations).toBe(2);

    releaseReconciliation();
    await Promise.all([first, overlapping]);
    runtime.dispose();
  });

  it("registers the framework handler before recovering pending work", async () => {
    const store = new MemoryRuntimeStore();
    const order: string[] = [];
    const requests: JobQueueEnqueueRequest[] = [];
    let wakeup: (() => Promise<void>) | undefined;
    let registeredHandler: JobHandler | undefined;

    const runtime = await activateProjectionRuntime({
      store,
      queue: {
        enqueue: async (request): Promise<string> => {
          order.push("enqueue");
          requests.push(request);
          return "job-1";
        },
        getStatus: async () => null,
        registerHandler: (type, handler): void => {
          order.push(`register:${type}`);
          registeredHandler = handler;
        },
        unregisterHandler: (type): void => {
          order.push(`unregister:${type}`);
        },
      },
      setWakeup: (callback): (() => void) => {
        order.push("wakeup");
        wakeup = callback;
        return () => {
          wakeup = undefined;
        };
      },
      graph,
      rules: [projectionRule],
      inputContext,
      executionContext,
      reconcileTargets: async () => {},
      beforeWaveCompletion: async () => {},
      logger: createSilentLogger(),
      createWaveId: () => "wave-1",
      now: () => 10,
    });

    expect(order.slice(0, 3)).toEqual([
      `register:${PROJECTION_RULE_JOB_TYPE}`,
      "wakeup",
      "enqueue",
    ]);
    expect(registeredHandler).toBeDefined();
    expect(wakeup).toBeDefined();
    expect(requests[0]?.data).toEqual({
      waveId: "wave-1",
      ruleId: "document-summary",
    });

    runtime.dispose();
    expect(wakeup).toBeUndefined();
    expect(order.at(-1)).toBe(`unregister:${PROJECTION_RULE_JOB_TYPE}`);
  });
});
