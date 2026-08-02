import { describe, expect, it } from "bun:test";
import type {
  ClaimProjectionWaveInput,
  ProjectionWave,
  ProjectionWaveInput,
  ProjectionWaveRule,
  ProjectionWaveRuleInput,
} from "@brains/entity-service";
import type { JobQueueEnqueueRequest } from "@brains/job-queue";
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
    status: "running",
    startedAt: 10,
    completedAt: null,
  };
  readonly inputs: ProjectionWaveInput[];
  storedRules: ProjectionWaveRuleInput[] = [];
  queuedRules: Array<{ waveId: string; ruleId: string; jobId: string }> = [];
  completed = false;
  active = false;
  readonly completedRuleIds = new Set<string>();

  constructor(inputs: ProjectionWaveInput[]) {
    this.inputs = inputs;
  }

  getActiveWave(): Promise<ProjectionWave | null> {
    return Promise.resolve(this.active ? this.claimedWave : null);
  }

  claimPendingWave(
    input: ClaimProjectionWaveInput,
  ): Promise<ProjectionWave | null> {
    this.claimedWave.graphFingerprint = input.graphFingerprint;
    this.active = true;
    return Promise.resolve(this.claimedWave);
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

  enqueue(request: JobQueueEnqueueRequest): Promise<string> {
    this.requests.push(request);
    return Promise.resolve(`job-${this.requests.length}`);
  }
}

const topicRule = defineProjectionRule({
  id: "topics",
  version: "1",
  sources: [{ kind: "entity", types: ["document"] }],
  targetType: "topic",
  inputSchema: z.object({}),
  selectInput: async () => ({}),
  derive: async () => [],
});

const skillRule = defineProjectionRule({
  id: "skills",
  version: "1",
  sources: [{ kind: "entity", types: ["topic"] }],
  targetType: "skill",
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
      executionOwner: "wave-owned",
      sources: [{ kind: "entity", types: ["topic"] }],
    },
    {
      id: "topics",
      pluginId: "topics",
      targetType: "topic",
      executionOwner: "wave-owned",
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
  declaredCycles: [],
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
    kind: "entity",
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
      }),
    );
    expect(store.queuedRules).toEqual([
      { waveId: "wave-1", ruleId: "topics", jobId: "job-1" },
    ]);
  });

  it("advances topological levels and completes after the final outcome", async () => {
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

  it("completes a wave with no reachable executable rules", async () => {
    const store = new MemoryProjectionStore([
      {
        waveId: "wave-1",
        kind: "entity",
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
