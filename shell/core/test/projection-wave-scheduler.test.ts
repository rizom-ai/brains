import { describe, expect, it } from "bun:test";
import type {
  ClaimProjectionWaveInput,
  ProjectionDirtyInput,
  ProjectionIncidentInput,
  ProjectionWave,
  ProjectionWaveInput,
  ProjectionWaveRule,
  ProjectionWaveRuleInput,
} from "@brains/entity-service";
import type { JobInfo, JobQueueEnqueueRequest } from "@brains/job-queue";
import {
  computeProjectionInputFingerprint,
  defineProjectionRule,
  type ProjectionGraph,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  ProjectionWaveScheduler,
  type ProjectionWaveQueue,
  type ProjectionWaveStore,
} from "../src/projection-wave-scheduler";

class MemoryProjectionStore implements ProjectionWaveStore {
  readonly claimedWave: ProjectionWave = {
    id: "wave-1",
    cutoffGeneration: 100,
    graphFingerprint: "graph-fingerprint",
    admissionEpoch: 0,
    status: "running",
    startedAt: 10,
    completedAt: null,
  };
  readonly inputs: ProjectionWaveInput[];
  storedRules: ProjectionWaveRuleInput[] = [];
  queuedRules: Array<{ waveId: string; ruleId: string; jobId: string }> = [];
  completed = false;
  active = false;
  pending = true;
  latestMarkedAt = 0;
  readonly completedRuleIds = new Set<string>();
  readonly failedWaveIds: string[] = [];
  readonly incidents: ProjectionIncidentInput[] = [];

  constructor(inputs: ProjectionWaveInput[]) {
    this.inputs = inputs;
  }

  getWave(waveId: string): Promise<ProjectionWave | null> {
    return Promise.resolve(
      this.claimedWave.id === waveId ? this.claimedWave : null,
    );
  }

  getActiveWave(): Promise<ProjectionWave | null> {
    return Promise.resolve(this.active ? this.claimedWave : null);
  }

  claimPendingWave(
    input: ClaimProjectionWaveInput,
  ): Promise<ProjectionWave | null> {
    if (!this.pending) return Promise.resolve(null);
    this.pending = false;
    this.claimedWave.id = input.waveId;
    this.claimedWave.graphFingerprint = input.graphFingerprint;
    this.active = true;
    return Promise.resolve(this.claimedWave);
  }

  listPendingInputs(): Promise<ProjectionDirtyInput[]> {
    if (!this.pending) return Promise.resolve([]);
    return Promise.resolve(
      this.inputs.map((input) => ({
        generation: input.generation,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        revision: input.revision,
        operation: input.operation,
        markedAt: this.latestMarkedAt,
      })),
    );
  }

  listWaveInputs(_waveId: string): Promise<ProjectionWaveInput[]> {
    return Promise.resolve(this.inputs);
  }

  putWaveRules(
    _waveId: string,
    rules: readonly ProjectionWaveRuleInput[],
  ): Promise<void> {
    this.storedRules = [...rules];
    return Promise.resolve();
  }

  listWaveRules(_waveId: string): Promise<ProjectionWaveRule[]> {
    return Promise.resolve(
      this.storedRules.map((rule) => {
        const queued = this.queuedRules.find(
          (entry) => entry.ruleId === rule.ruleId,
        );
        const completed = this.completedRuleIds.has(rule.ruleId);
        return {
          waveId: "wave-1",
          ruleId: rule.ruleId,
          targetType: rule.targetType,
          targets: { authority: "additive" },
          level: rule.level,
          jobId: queued?.jobId ?? null,
          status: completed ? "completed" : queued ? "queued" : "pending",
          inputFingerprint: completed ? `input-${rule.ruleId}` : null,
          changedTargets: [],
        };
      }),
    );
  }

  queueWaveRule(
    waveId: string,
    ruleId: string,
    jobId: string,
  ): Promise<unknown> {
    this.queuedRules.push({ waveId, ruleId, jobId });
    return Promise.resolve();
  }

  failWave(waveId: string, failedAt: number): Promise<ProjectionWave> {
    this.failedWaveIds.push(waveId);
    this.active = false;
    this.pending = true;
    this.storedRules = [];
    this.queuedRules = [];
    this.completedRuleIds.clear();
    return Promise.resolve({
      ...this.claimedWave,
      status: "failed",
      completedAt: failedAt,
    });
  }

  failWaveWithIncident(
    input: ProjectionIncidentInput,
  ): Promise<ProjectionWave> {
    this.incidents.push(input);
    return this.failWave(input.waveId, input.failedAt);
  }

  completeWave(_waveId: string, _completedAt: number): Promise<ProjectionWave> {
    this.completed = true;
    this.active = false;
    return Promise.resolve({
      ...this.claimedWave,
      status: "completed",
      completedAt: 10,
    });
  }
}

class MemoryProjectionQueue implements ProjectionWaveQueue {
  readonly requests: JobQueueEnqueueRequest[] = [];
  readonly statuses = new Map<string, JobInfo>();

  enqueue(request: JobQueueEnqueueRequest): Promise<string> {
    this.requests.push(request);
    const jobId = `job-${this.requests.length}`;
    this.statuses.set(jobId, queueJob(jobId, "pending"));
    return Promise.resolve(jobId);
  }

  getStatus(jobId: string): Promise<JobInfo | null> {
    return Promise.resolve(this.statuses.get(jobId) ?? null);
  }

  setStatus(jobId: string, status: JobInfo["status"]): void {
    this.statuses.set(jobId, queueJob(jobId, status));
  }
}

function queueJob(id: string, status: JobInfo["status"]): JobInfo {
  return {
    id,
    type: "shell:projection-rule",
    data: "{}",
    status,
    source: "projection-scheduler",
    priority: 0,
    retryCount: status === "failed" ? 3 : 0,
    maxRetries: 3,
    lastError: status === "failed" ? "No handler registered" : null,
    createdAt: 10,
    scheduledFor: 10,
    startedAt: status === "pending" ? null : 10,
    completedAt: status === "completed" || status === "failed" ? 20 : null,
    attemptId: null,
    workerSlotId: null,
    workerSessionId: null,
    leaseExpiresAt: null,
    attemptHeartbeatAt: null,
    runtimeUpdatedAt: null,
    metadata: {
      rootJobId: "projection-wave:wave-1",
      operationType: "data_processing",
    },
    progress: null,
    result: null,
  };
}

const topicRule = defineProjectionRule({
  id: "topics",
  version: "1",
  sources: [{ kind: "entity", types: ["document"] }],
  targetType: "topic",
  targets: { authority: "additive" },
  inputSchema: z.object({}),
  selectInput: async () => ({}),
  derive: async () => [],
});

const delayedTopicRule = defineProjectionRule({
  id: "topics",
  version: "1",
  sources: [{ kind: "entity", types: ["document"] }],
  targetType: "topic",
  targets: { authority: "additive" },
  sourceChangeBatchDelayMs: 1_000,
  inputSchema: z.object({}),
  selectInput: async () => ({}),
  derive: async () => [],
});

const skillRule = defineProjectionRule({
  id: "skills",
  version: "1",
  sources: [{ kind: "entity", types: ["topic"] }],
  targetType: "skill",
  targets: { authority: "additive" },
  inputSchema: z.object({}),
  selectInput: async () => ({}),
  derive: async () => [],
});

const graph: ProjectionGraph = {
  projections: [
    {
      id: "skills",
      pluginId: "skills",
      targetType: "skill",
      sources: [{ kind: "entity", types: ["topic"] }],
    },
    {
      id: "topics",
      pluginId: "topics",
      targetType: "topic",
      sources: [{ kind: "entity", types: ["document"] }],
    },
  ],
  edges: [
    {
      from: "topics",
      to: "skills",
      causes: ["entity:topic"],
    },
  ],
  unknownSourceTypes: [],
};

const graphFingerprint = computeProjectionInputFingerprint({
  projections: graph.projections,
  edges: graph.edges,
  rules: [skillRule, topicRule]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((rule) => ({ id: rule.id, version: rule.version })),
});

function documentInputs(count: number): ProjectionWaveInput[] {
  return Array.from({ length: count }, (_unused, index) => ({
    waveId: "wave-1",
    sourceType: "document",
    sourceId: `document-${index}`,
    revision: `hash-${index}`,
    operation: "upsert",
    generation: index + 1,
  }));
}

describe("ProjectionWaveScheduler", () => {
  it("creates one job per reachable rule rather than one per dirty entity", async () => {
    const store = new MemoryProjectionStore(documentInputs(100));
    const queue = new MemoryProjectionQueue();
    const scheduler = new ProjectionWaveScheduler({
      store,
      queue,
      graph,
      rules: [topicRule, skillRule],
      createWaveId: (): string => "wave-1",
      now: (): number => 10,
    });

    await scheduler.startNextWave();

    expect(store.storedRules).toEqual([
      { ruleId: "topics", targetType: "topic", level: 0 },
      { ruleId: "skills", targetType: "skill", level: 1 },
    ]);
    expect(queue.requests).toHaveLength(1);
    expect(queue.requests[0]).toEqual(
      expect.objectContaining({
        type: "shell:projection-rule",
        data: { waveId: "wave-1", ruleId: "topics" },
        options: expect.objectContaining({
          rootJobId: "projection-wave:wave-1",
        }),
      }),
    );
    expect(store.queuedRules).toEqual([
      { waveId: "wave-1", ruleId: "topics", jobId: "job-1" },
    ]);
  });

  it("honors sourceChangeBatchDelayMs and reschedules from the latest input", async () => {
    const store = new MemoryProjectionStore(documentInputs(2));
    store.latestMarkedAt = 100;
    const queue = new MemoryProjectionQueue();
    let now = 100;
    const scheduled: Array<{
      delayMs: number;
      wakeup: () => Promise<void>;
      cancelled: boolean;
    }> = [];
    const scheduler = new ProjectionWaveScheduler({
      store,
      queue,
      graph,
      rules: [delayedTopicRule, skillRule],
      createWaveId: (): string => "wave-1",
      now: (): number => now,
      scheduleWakeup: (delayMs, wakeup) => {
        const entry = { delayMs, wakeup, cancelled: false };
        scheduled.push(entry);
        return (): void => {
          entry.cancelled = true;
        };
      },
    });

    await scheduler.startNextWave();

    expect(queue.requests).toEqual([]);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.delayMs).toBe(1_000);

    now = 500;
    store.latestMarkedAt = 500;
    await scheduler.startNextWave();

    expect(scheduled[0]?.cancelled).toBe(true);
    expect(scheduled[1]?.delayMs).toBe(1_000);

    now = 1_500;
    await scheduled[1]?.wakeup();

    expect(queue.requests.map(({ data }) => data)).toEqual([
      { waveId: "wave-1", ruleId: "topics" },
    ]);
  });

  it("advances topological levels and completes after the final outcome", async () => {
    const store = new MemoryProjectionStore(documentInputs(100));
    const queue = new MemoryProjectionQueue();
    const completionSummaries: unknown[] = [];
    const scheduler = new ProjectionWaveScheduler({
      store,
      queue,
      graph,
      rules: [topicRule, skillRule],
      createWaveId: (): string => "wave-1",
      beforeWaveCompletion: async (summary): Promise<void> => {
        completionSummaries.push(summary);
      },
      now: (): number => 10,
    });

    await scheduler.startNextWave();
    store.completedRuleIds.add("topics");
    await scheduler.advanceActiveWave("wave-1");
    store.completedRuleIds.add("skills");
    await scheduler.advanceActiveWave("wave-1");

    expect(queue.requests.map(({ data }) => data)).toEqual([
      { waveId: "wave-1", ruleId: "topics" },
      { waveId: "wave-1", ruleId: "skills" },
    ]);
    expect(store.completed).toBe(true);
    expect(store.active).toBe(false);
    expect(completionSummaries).toEqual([
      {
        waveId: "wave-1",
        sourceTypes: ["document"],
        changedTargetTypes: [],
      },
    ]);
  });

  it("accepts advancement after a coordination sweep already completed the wave", async () => {
    const store = new MemoryProjectionStore(documentInputs(100));
    store.claimedWave.status = "completed";
    store.claimedWave.completedAt = 10;
    const scheduler = new ProjectionWaveScheduler({
      store,
      queue: new MemoryProjectionQueue(),
      graph,
      rules: [topicRule, skillRule],
      createWaveId: (): string => "unused",
      now: (): number => 20,
    });

    const advanced = await scheduler.advanceActiveWave("wave-1");

    expect(advanced).toMatchObject({
      id: "wave-1",
      status: "completed",
    });
  });

  it("reconstructs rule records after interruption immediately after claim", async () => {
    const store = new MemoryProjectionStore(documentInputs(2));
    store.active = true;
    store.claimedWave.graphFingerprint = graphFingerprint;
    const queue = new MemoryProjectionQueue();
    const scheduler = new ProjectionWaveScheduler({
      store,
      queue,
      graph,
      rules: [topicRule, skillRule],
      createWaveId: (): string => "unused",
      now: (): number => 20,
    });

    await scheduler.startNextWave();

    expect(store.completed).toBe(false);
    expect(store.storedRules).toEqual([
      { ruleId: "topics", targetType: "topic", level: 0 },
      { ruleId: "skills", targetType: "skill", level: 1 },
    ]);
    expect(queue.requests[0]?.data).toEqual({
      waveId: "wave-1",
      ruleId: "topics",
    });
  });

  it("resumes an active wave from the first incomplete level", async () => {
    const store = new MemoryProjectionStore(documentInputs(1));
    store.active = true;
    store.claimedWave.graphFingerprint = graphFingerprint;
    store.storedRules = [
      { ruleId: "topics", targetType: "topic", level: 0 },
      { ruleId: "skills", targetType: "skill", level: 1 },
    ];
    store.completedRuleIds.add("topics");
    store.queuedRules.push({
      waveId: "wave-1",
      ruleId: "topics",
      jobId: "job-old",
    });
    const queue = new MemoryProjectionQueue();
    const scheduler = new ProjectionWaveScheduler({
      store,
      queue,
      graph,
      rules: [topicRule, skillRule],
      createWaveId: (): string => "unused",
      now: (): number => 20,
    });

    await scheduler.startNextWave();

    expect(queue.requests).toHaveLength(1);
    expect(queue.requests[0]?.data).toEqual({
      waveId: "wave-1",
      ruleId: "skills",
    });
    expect(store.queuedRules.at(-1)).toEqual({
      waveId: "wave-1",
      ruleId: "skills",
      jobId: "job-1",
    });
  });

  it("persists a terminal incident without immediately replaying the wave", async () => {
    const store = new MemoryProjectionStore(documentInputs(1));
    store.active = true;
    store.claimedWave.graphFingerprint = graphFingerprint;
    store.storedRules = [
      { ruleId: "topics", targetType: "topic", level: 0 },
      { ruleId: "skills", targetType: "skill", level: 1 },
    ];
    store.queuedRules.push({
      waveId: "wave-1",
      ruleId: "topics",
      jobId: "job-terminal",
    });
    const queue = new MemoryProjectionQueue();
    queue.setStatus("job-terminal", "failed");
    const scheduler = new ProjectionWaveScheduler({
      store,
      queue,
      graph,
      rules: [topicRule, skillRule],
      createWaveId: (): string => "wave-2",
      now: (): number => 30,
    });

    await scheduler.startNextWave();

    expect(store.failedWaveIds).toEqual(["wave-1"]);
    expect(store.incidents).toEqual([
      {
        waveId: "wave-1",
        ruleId: "topics",
        jobId: "job-terminal",
        failureReason: "Projection rule job exhausted retries",
        failedAt: 30,
      },
    ]);
    expect(store.claimedWave.id).toBe("wave-1");
    expect(queue.requests).toEqual([]);

    await scheduler.startNextWave();

    expect(store.claimedWave.id).toBe("wave-2");
    expect(queue.requests.map(({ data }) => data)).toEqual([
      { waveId: "wave-2", ruleId: "topics" },
    ]);
  });

  it("does not create a terminal incident for a superseded sibling job", async () => {
    const store = new MemoryProjectionStore(documentInputs(1));
    store.claimedWave.status = "superseded";
    store.claimedWave.completedAt = 25;
    const scheduler = new ProjectionWaveScheduler({
      store,
      queue: new MemoryProjectionQueue(),
      graph,
      rules: [topicRule, skillRule],
      createWaveId: (): string => "unused",
      now: (): number => 30,
    });

    expect(
      await scheduler.failActiveWaveWithIncident({
        waveId: "wave-1",
        ruleId: "topics",
        jobId: "job-sibling",
        failureReason: "Sibling observed supersession",
      }),
    ).toEqual(expect.objectContaining({ status: "superseded" }));
    expect(store.incidents).toEqual([]);
  });

  it("fails an active wave after a terminal rule failure", async () => {
    const store = new MemoryProjectionStore(documentInputs(1));
    const scheduler = new ProjectionWaveScheduler({
      store,
      queue: new MemoryProjectionQueue(),
      graph,
      rules: [topicRule, skillRule],
      createWaveId: (): string => "wave-1",
      now: (): number => 30,
    });
    await scheduler.startNextWave();

    expect(await scheduler.failActiveWave("wave-1")).toEqual(
      expect.objectContaining({ status: "failed", completedAt: 30 }),
    );
    expect(store.active).toBe(false);
    expect(store.pending).toBe(true);
  });

  it("refuses to resume a wave pinned to another graph", async () => {
    const store = new MemoryProjectionStore(documentInputs(1));
    store.active = true;
    const queue = new MemoryProjectionQueue();
    const scheduler = new ProjectionWaveScheduler({
      store,
      queue,
      graph,
      rules: [topicRule, skillRule],
      createWaveId: (): string => "unused",
      now: (): number => 20,
    });

    void expect(scheduler.startNextWave()).rejects.toThrow(
      "graph fingerprint does not match",
    );
    expect(queue.requests).toEqual([]);
  });

  it("keeps the wave active when its completion effect fails", async () => {
    const store = new MemoryProjectionStore([
      {
        waveId: "wave-1",
        sourceType: "unrelated",
        sourceId: "unrelated-1",
        revision: "hash-1",
        operation: "upsert",
        generation: 1,
      },
    ]);
    const scheduler = new ProjectionWaveScheduler({
      store,
      queue: new MemoryProjectionQueue(),
      graph,
      rules: [topicRule, skillRule],
      createWaveId: (): string => "wave-1",
      beforeWaveCompletion: async (): Promise<void> => {
        throw new Error("completion effect failed");
      },
      now: (): number => 10,
    });

    void expect(scheduler.startNextWave()).rejects.toThrow(
      "completion effect failed",
    );
    expect(store.completed).toBe(false);
    expect(store.active).toBe(true);
  });

  it("completes a wave with no reachable executable rules", async () => {
    const store = new MemoryProjectionStore([
      {
        waveId: "wave-1",
        sourceType: "unrelated",
        sourceId: "unrelated-1",
        revision: "hash-1",
        operation: "upsert",
        generation: 1,
      },
    ]);
    const queue = new MemoryProjectionQueue();
    const scheduler = new ProjectionWaveScheduler({
      store,
      queue,
      graph,
      rules: [topicRule, skillRule],
      createWaveId: (): string => "wave-1",
      now: (): number => 10,
    });

    await scheduler.startNextWave();

    expect(store.completed).toBe(true);
    expect(store.storedRules).toEqual([]);
    expect(queue.requests).toEqual([]);
  });
});
