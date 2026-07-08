import { describe, it, expect } from "bun:test";
import { createMockShell } from "@brains/test-utils";
import { playbookBodySchema, type PlaybookBody } from "../src/entity";
import { PlaybookRunStore, type PlaybookRun } from "../src/run-store";
import { RunEngine, type GoalCheckResult } from "../src/lib/run-engine";

const body: PlaybookBody = playbookBodySchema.parse({
  purpose: "Test playbook",
  initialState: "draft",
  states: [
    {
      id: "draft",
      title: "Draft",
      doneWhen: ["outline saved"],
      transitions: [{ event: "NEXT", target: "review" }],
    },
    {
      id: "review",
      title: "Review",
      transitions: [
        { event: "NEXT", target: "done" },
        { event: "BACK", target: "draft" },
      ],
    },
    { id: "done", title: "Done" },
  ],
  finalStates: ["done"],
});

function createEngine(options?: {
  goalCheckResult?: GoalCheckResult;
  goalCheckError?: Error;
}): {
  engine: RunEngine;
  store: PlaybookRunStore;
  goalCheckCalls: number[];
} {
  const store = new PlaybookRunStore(createMockShell().getRuntimeState());
  const goalCheckCalls: number[] = [];
  const engine = new RunEngine({
    store,
    goalCheck: {
      evaluate: async (): Promise<GoalCheckResult> => {
        goalCheckCalls.push(1);
        if (options?.goalCheckError) throw options.goalCheckError;
        return (
          options?.goalCheckResult ?? {
            met: false,
            reason: "No evidence yet",
          }
        );
      },
    },
    getPlaybook: async (
      playbookId: string,
    ): Promise<{ version: string; body: PlaybookBody } | undefined> =>
      playbookId === "test-playbook" ? { version: "hash-1", body } : undefined,
    withRunLock: <T>(_runId: string, operation: () => Promise<T>): Promise<T> =>
      operation(),
  });
  return { engine, store, goalCheckCalls };
}

async function startRun(
  engine: RunEngine,
  conversationId?: string,
): Promise<PlaybookRun> {
  return engine.createStartedRun({
    playbookId: "test-playbook",
    playbookVersion: "hash-1",
    body,
    conversationId,
  });
}

describe("createStartedRun", () => {
  it("persists an active run at the initial state", async () => {
    const { engine, store } = createEngine();
    const run = await startRun(engine);

    const stored = await store.findById(run.id);
    expect(stored?.currentState).toBe("draft");
    expect(stored?.status).toBe("active");
  });
});

describe("transitionRun", () => {
  it("rejects unknown states and invalid events", async () => {
    const { engine } = createEngine();
    const run = await startRun(engine);

    const missing = await engine.transitionRun(
      { ...run, currentState: "nope" },
      body,
      "NEXT",
    );
    expect(missing).toEqual({
      success: false,
      error: "Playbook state not found: nope",
    });

    const invalid = await engine.transitionRun(run, body, "WHATEVER");
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error).toContain("Invalid playbook event");
    }
  });

  it("blocks gated NEXT when the goal check is not met", async () => {
    const { engine, goalCheckCalls } = createEngine();
    const run = await startRun(engine);

    const result = await engine.transitionRun(run, body, "NEXT");

    expect(goalCheckCalls.length).toBe(1);
    expect(result.success).toBe(false);
    if (!result.success) {
      // The unmet gate guard makes the event invalid at the machine level.
      expect(result.error).toContain("Invalid playbook event 'NEXT'");
      expect(result.gateVerdicts?.[0]?.met).toBe(false);
    }
  });

  it("allows gated NEXT once the goal check passes", async () => {
    const { engine } = createEngine({
      goalCheckResult: { met: true, reason: "Outline exists" },
    });
    const run = await startRun(engine);

    const result = await engine.transitionRun(run, body, "NEXT");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.currentState).toBe("review");
      expect(result.gateVerdicts[0]?.met).toBe(true);
    }
  });

  it("treats a failing goal check as not met", async () => {
    const { engine } = createEngine({
      goalCheckError: new Error("judge unavailable"),
    });
    const run = await startRun(engine);

    const result = await engine.transitionRun(run, body, "NEXT");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.gateVerdicts?.[0]?.reason).toContain("judge unavailable");
    }
  });

  it("passes ungated events straight through", async () => {
    const { engine, goalCheckCalls } = createEngine();
    const run = await startRun(engine);

    const result = await engine.transitionRun(
      { ...run, currentState: "review" },
      body,
      "BACK",
    );

    expect(goalCheckCalls.length).toBe(0);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.currentState).toBe("draft");
    }
  });
});

describe("recordEntityEventEvidence", () => {
  const payload = (run: PlaybookRun): Record<string, unknown> => ({
    entityType: "note",
    entityId: "note-1",
    runId: run.id,
  });

  it("ignores payloads without entity identifiers or active runs", async () => {
    const { engine, store } = createEngine();
    const run = await startRun(engine);

    expect(await engine.recordEntityEventEvidence("created", {})).toEqual({
      recorded: false,
    });

    await store.upsert({ ...run, status: "dismissed" });
    expect(
      await engine.recordEntityEventEvidence("created", payload(run)),
    ).toEqual({ recorded: false });
  });

  it("records evidence for the current state and advances a satisfied gate", async () => {
    const { engine, store } = createEngine({
      goalCheckResult: { met: true, reason: "Outline exists" },
    });
    const run = await startRun(engine, "conv-1");

    const result = await engine.recordEntityEventEvidence("created", {
      entityType: "note",
      entityId: "note-1",
      conversationId: "conv-1",
    });
    expect(result).toEqual({ recorded: true });

    const updated = await store.findById(run.id);
    expect(updated?.evidence[0]?.data["entityId"]).toBe("note-1");
    expect(updated?.evidence[0]?.stateId).toBe("draft");
    // Goal met + single NEXT: the run auto-advances.
    expect(updated?.currentState).toBe("review");
    expect(updated?.completedStates).toEqual(["draft"]);
  });

  it("persists a not-met verdict without advancing", async () => {
    const { engine, store } = createEngine();
    const run = await startRun(engine);

    await engine.recordEntityEventEvidence("created", payload(run));

    const updated = await store.findById(run.id);
    expect(updated?.currentState).toBe("draft");
    expect(updated?.gateVerdicts[0]?.met).toBe(false);
  });
});
