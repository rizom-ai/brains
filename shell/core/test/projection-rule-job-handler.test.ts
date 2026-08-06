import { describe, expect, it, mock } from "bun:test";
import type {
  ApplyProjectionRuleResultInput,
  GetProjectionRuleMemoInput,
  ProjectionRuleMemoValue,
  ProjectionWriteIntent,
  ProjectionWaveInput,
  ProjectionWaveRule,
} from "@brains/entity-service";
import {
  defineProjectionRule,
  type ProjectionExecutionContext,
  type ProjectionInputContext,
} from "@brains/plugins";
import { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import {
  ProjectionRuleJobHandler,
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

const progressReporter = ProgressReporter.from(async () => {});
if (!progressReporter) throw new Error("Failed to create progress reporter");

class MemoryExecutionStore implements ProjectionRuleExecutionStore {
  readonly inputs: ProjectionWaveInput[];
  memo: ProjectionRuleMemoValue | null = null;
  applied: ApplyProjectionRuleResultInput | null = null;

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
  ): Promise<ProjectionWaveRule> {
    this.applied = input;
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

  advanceActiveWave(waveId: string): Promise<unknown> {
    this.advancedWaveIds.push(waveId);
    return Promise.resolve();
  }

  failActiveWave(waveId: string): Promise<unknown> {
    this.failedWaveIds.push(waveId);
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
    const handler = new ProjectionRuleJobHandler({
      rules: [rule],
      store,
      coordinator,
      inputContext,
      executionContext,
      reconcileTargets,
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
      now: (): number => 20,
    });

    await handler.onTerminalError(new Error("exhausted"), {
      waveId: "wave-1",
      ruleId: "topics",
    });

    expect(coordinator.failedWaveIds).toEqual(["wave-1"]);
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
