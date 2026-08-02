import { describe, expect, it } from "bun:test";
import type { OperationProvenance } from "@brains/contracts";
import { OperationContext } from "@brains/operation-context";
import type { ProjectionGraph } from "@brains/plugins";
import { ProjectionRuntimeSupervisor } from "../src/projection-runtime-supervisor";
import { z } from "@brains/utils/zod";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
  RuntimeStateRecordValue,
  RuntimeStateScopeOptions,
} from "@brains/runtime-state";

function graph(options: { feedback?: boolean } = {}): ProjectionGraph {
  return {
    projections: [
      {
        id: "topics-projection",
        pluginId: "topics",
        targetType: "topic",
        executionOwner: "event-owned",
        sources: [{ kind: "entity", types: ["document"] }],
        ...(options.feedback && {
          feedback: {
            allowed: true,
            convergenceRule: "Input fingerprints make repeats no-ops",
            deduplicationKey: "topics",
            maxDepth: 3,
          },
        }),
      },
    ],
    edges: [],
    declaredCycles: [],
    unknownSourceTypes: [],
  };
}

function createMemoryRuntimeState(): IRuntimeStateNamespace {
  const values = new Map<
    string,
    { value: unknown; createdAt: Date; updatedAt: Date }
  >();
  return {
    scoped: <T>(
      options: RuntimeStateScopeOptions<T>,
    ): IRuntimeStateStore<T> => ({
      get: async (key): Promise<T | null> => {
        const record = values.get(key);
        return record ? options.schema.parse(record.value) : null;
      },
      has: async (key): Promise<boolean> => values.has(key),
      set: async (key, value): Promise<void> => {
        const now = new Date();
        values.set(key, {
          value: options.schema.parse(value),
          createdAt: values.get(key)?.createdAt ?? now,
          updatedAt: now,
        });
      },
      setIfNotExists: async (key, value): Promise<boolean> => {
        if (values.has(key)) return false;
        const now = new Date();
        values.set(key, {
          value: options.schema.parse(value),
          createdAt: now,
          updatedAt: now,
        });
        return true;
      },
      delete: async (key): Promise<boolean> => values.delete(key),
      list: async (): Promise<RuntimeStateRecordValue<T>[]> =>
        Array.from(values, ([key, record]) => ({
          key,
          value: options.schema.parse(record.value),
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        })),
      clear: async (): Promise<number> => {
        const size = values.size;
        values.clear();
        return size;
      },
    }),
  };
}

function provenance(
  overrides: Partial<OperationProvenance> = {},
): OperationProvenance {
  return {
    rootJobId: "root-1",
    causationId: "message-1",
    projectionId: "topics-projection",
    projectionLineage: ["topics-projection"],
    derivationDepth: 1,
    ...overrides,
  };
}

describe("ProjectionRuntimeSupervisor", () => {
  it("rejects repeated undeclared projections and opens a circuit", async () => {
    let now = 1_000;
    const supervisor = ProjectionRuntimeSupervisor.createFresh(
      OperationContext.createFresh(),
      { now: (): number => now, circuitOpenMs: 500 },
    );
    await supervisor.initialize(graph());

    void expect(
      supervisor.assertJobAdmission(
        provenance({
          projectionLineage: ["topics-projection", "topics-projection"],
          derivationDepth: 2,
        }),
      ),
    ).rejects.toThrow("repeats in one causal lineage");
    expect(await supervisor.getDiagnostics()).toMatchObject({
      status: "unhealthy",
      openCircuits: [
        {
          projectionId: "topics-projection",
          openedAt: 1_000,
          expiresAt: 1_500,
        },
      ],
    });

    now = 1_500;
    expect((await supervisor.getDiagnostics()).openCircuits).toEqual([]);
  });

  it("allows declared feedback only within its depth bound", async () => {
    const supervisor = ProjectionRuntimeSupervisor.createFresh(
      OperationContext.createFresh(),
    );
    await supervisor.initialize(graph({ feedback: true }));

    await supervisor.assertJobAdmission(
      provenance({
        projectionLineage: ["topics-projection", "topics-projection"],
        derivationDepth: 2,
      }),
    );
    void expect(
      supervisor.assertJobAdmission(
        provenance({
          projectionLineage: [
            "topics-projection",
            "topics-projection",
            "topics-projection",
            "topics-projection",
          ],
          derivationDepth: 4,
        }),
      ),
    ).rejects.toThrow("depth 4 exceeds its declared maximum 3");
  });

  it("enforces per-root job and mutation budgets", async () => {
    const operationContext = OperationContext.createFresh();
    const supervisor = ProjectionRuntimeSupervisor.createFresh(
      operationContext,
      { maxJobsPerRoot: 1, maxMutationsPerRoot: 1 },
    );
    await supervisor.initialize(graph());
    const current = provenance();

    await supervisor.assertJobAdmission(current);
    void expect(supervisor.assertJobAdmission(current)).rejects.toThrow(
      "exceeded projection job budget 1",
    );

    const mutationSupervisor = ProjectionRuntimeSupervisor.createFresh(
      operationContext,
      { maxJobsPerRoot: 10, maxMutationsPerRoot: 1 },
    );
    await mutationSupervisor.initialize(graph());
    await operationContext.run(current, "topic-job", async () => {
      await mutationSupervisor.assertMutationAdmission({
        operation: "create",
        entityType: "topic",
        entityId: "one",
      });
      void expect(
        mutationSupervisor.assertMutationAdmission({
          operation: "update",
          entityType: "topic",
          entityId: "two",
        }),
      ).rejects.toThrow("exceeded projection mutation budget 1");
    });
  });

  it("opens a circuit for repeated writes to the same target", async () => {
    const operationContext = OperationContext.createFresh();
    const supervisor = ProjectionRuntimeSupervisor.createFresh(
      operationContext,
      { repeatedTargetLimit: 2 },
    );
    await supervisor.initialize(graph());

    await operationContext.run(provenance(), "topic-job", async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        await supervisor.assertMutationAdmission({
          operation: "update",
          entityType: "topic",
          entityId: "same-target",
        });
      }
      void expect(
        supervisor.assertMutationAdmission({
          operation: "update",
          entityType: "topic",
          entityId: "same-target",
        }),
      ).rejects.toThrow("repeatedly mutated topic:same-target");
    });
  });

  it("persists open circuits and rehydrates them across restarts", async () => {
    let now = 1_000;
    const runtimeState = createMemoryRuntimeState();
    const first = ProjectionRuntimeSupervisor.createFresh(
      OperationContext.createFresh(),
      { now: (): number => now, circuitOpenMs: 500, runtimeState },
    );
    await first.initialize(graph());

    void expect(
      Promise.resolve().then(() =>
        first.assertJobAdmission(
          provenance({
            projectionLineage: ["topics-projection", "topics-projection"],
            derivationDepth: 2,
          }),
        ),
      ),
    ).rejects.toThrow("repeats in one causal lineage");

    const restarted = ProjectionRuntimeSupervisor.createFresh(
      OperationContext.createFresh(),
      { now: (): number => now, circuitOpenMs: 500, runtimeState },
    );
    await restarted.initialize(graph());
    expect((await restarted.getDiagnostics()).openCircuits).toHaveLength(1);

    now = 1_500;
    expect((await restarted.getDiagnostics()).openCircuits).toEqual([]);
    expect(
      await runtimeState
        .scoped({ namespace: "shell.projection-circuits", schema: z.unknown() })
        .list(),
    ).toEqual([]);
  });

  it("bounds retained root counters deterministically", async () => {
    let now = 1;
    const supervisor = ProjectionRuntimeSupervisor.createFresh(
      OperationContext.createFresh(),
      { now: () => now, maxTrackedRoots: 2, retentionMs: 100 },
    );
    await supervisor.initialize(graph());

    for (const rootJobId of ["root-1", "root-2", "root-3"]) {
      await supervisor.assertJobAdmission(provenance({ rootJobId }));
      now++;
    }
    expect((await supervisor.getDiagnostics()).trackedRoots).toBe(2);

    now = 200;
    expect((await supervisor.getDiagnostics()).trackedRoots).toBe(0);
  });
});
