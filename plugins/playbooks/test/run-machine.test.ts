import { describe, it, expect } from "bun:test";
import { playbookBodySchema, type PlaybookBody } from "../src/entity";
import { createPlaybookRun, type PlaybookRun } from "../src/run-store";
import {
  buildMachine,
  canTransition,
  evidenceForState,
  formatTransition,
  formatVerifierStatus,
  getBlockedTransitions,
  getState,
  getValidTransitions,
  hasSatisfiedGateVerdicts,
  sameGoal,
  transitionRequiresGateVerdict,
} from "../src/lib/run-machine";

const body: PlaybookBody = playbookBodySchema.parse({
  purpose: "Test playbook",
  initialState: "draft",
  states: [
    {
      id: "draft",
      title: "Draft",
      doneWhen: ["outline saved"],
      transitions: [
        { event: "NEXT", target: "review" },
        { event: "ABANDON", target: "done", label: "Abandon the draft" },
      ],
    },
    {
      id: "review",
      title: "Review",
      transitions: [{ event: "NEXT", target: "done" }],
    },
    { id: "done", title: "Done" },
  ],
  finalStates: ["done"],
});

function run(overrides?: Partial<PlaybookRun>): PlaybookRun {
  const base = createPlaybookRun({
    playbookId: "test-playbook",
    playbookVersion: "hash-1",
    initialState: "draft",
  });
  return { ...base, ...overrides };
}

function metVerdict(): PlaybookRun["gateVerdicts"][number] {
  return {
    stateId: "draft",
    goal: ["outline saved"],
    met: true,
    reason: "Outline entity exists",
    evaluatedAt: "2026-07-06T00:00:00.000Z",
  };
}

const draft = getState(body, "draft");
if (!draft) throw new Error("fixture draft state missing");

describe("sameGoal", () => {
  it("compares goals element-wise", () => {
    expect(sameGoal(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameGoal(["a"], ["a", "b"])).toBe(false);
    expect(sameGoal(["a", "b"], ["b", "a"])).toBe(false);
  });
});

describe("transitionRequiresGateVerdict", () => {
  it("requires a verdict only for NEXT out of a gated state", () => {
    expect(transitionRequiresGateVerdict(draft, "NEXT")).toBe(true);
    expect(transitionRequiresGateVerdict(draft, "ABANDON")).toBe(false);

    const review = getState(body, "review");
    if (!review) throw new Error("fixture review state missing");
    expect(transitionRequiresGateVerdict(review, "NEXT")).toBe(false);
  });
});

describe("hasSatisfiedGateVerdicts", () => {
  it("matches on state, exact goal, and met", () => {
    expect(hasSatisfiedGateVerdicts(draft, run())).toBe(false);
    expect(
      hasSatisfiedGateVerdicts(draft, run({ gateVerdicts: [metVerdict()] })),
    ).toBe(true);
    expect(
      hasSatisfiedGateVerdicts(
        draft,
        run({ gateVerdicts: [{ ...metVerdict(), met: false }] }),
      ),
    ).toBe(false);
    expect(
      hasSatisfiedGateVerdicts(
        draft,
        run({ gateVerdicts: [{ ...metVerdict(), goal: ["something else"] }] }),
      ),
    ).toBe(false);
  });
});

describe("machine transitions", () => {
  it("blocks gated NEXT until the verdict is met and allows ungated events", () => {
    const pending = run();
    expect(canTransition(pending, body, "NEXT")).toBe(false);
    expect(canTransition(pending, body, "ABANDON")).toBe(true);

    const satisfied = run({ gateVerdicts: [metVerdict()] });
    expect(canTransition(satisfied, body, "NEXT")).toBe(true);
  });

  it("splits valid and blocked transitions accordingly", () => {
    const pending = run();
    expect(
      getValidTransitions(pending, body, draft).map((t) => t.event),
    ).toEqual(["ABANDON"]);
    expect(
      getBlockedTransitions(pending, body, draft).map((t) => t.event),
    ).toEqual(["NEXT"]);
  });

  it("builds a machine whose final states accept no events", () => {
    const finished = run({ currentState: "done" });
    expect(canTransition(finished, body, "NEXT")).toBe(false);
  });

  it("resolves the machine at the run's current state", () => {
    const inReview = run({ currentState: "review" });
    expect(canTransition(inReview, body, "NEXT")).toBe(true);
    expect(canTransition(inReview, body, "ABANDON")).toBe(false);

    const machine = buildMachine("test-playbook", body, inReview);
    expect(machine.id).toBe("test-playbook");
  });
});

describe("evidenceForState", () => {
  it("keeps unscoped evidence and evidence for the given state", () => {
    const observedAt = "2026-07-06T00:00:00.000Z";
    const evidence = [
      {
        id: "ev-unscoped",
        kind: "entity_event" as const,
        observedAt,
        data: {},
      },
      {
        id: "ev-draft",
        kind: "entity_event" as const,
        observedAt,
        data: {},
        stateId: "draft",
      },
      {
        id: "ev-review",
        kind: "entity_event" as const,
        observedAt,
        data: {},
        stateId: "review",
      },
    ];
    const scoped = run({ evidence });

    expect(evidenceForState(scoped, "draft").map((e) => e.id)).toEqual([
      "ev-unscoped",
      "ev-draft",
    ]);
  });
});

describe("formatting", () => {
  it("formats transitions with and without descriptions", () => {
    expect(formatTransition({ event: "NEXT", target: "review" })).toBe(
      "- NEXT -> review",
    );
    expect(
      formatTransition({
        event: "ABANDON",
        target: "done",
        label: "Abandon the draft",
      }),
    ).toBe("- ABANDON -> done: Abandon the draft");
  });

  it("formats verifier status for gated and ungated states", () => {
    const review = getState(body, "review");
    if (!review) throw new Error("fixture review state missing");

    expect(formatVerifierStatus(run(), review)).toBe(
      "- no gated Done When conditions",
    );
    expect(formatVerifierStatus(run(), draft)).toBe(
      "- Not yet met: outline saved",
    );
    expect(
      formatVerifierStatus(run({ gateVerdicts: [metVerdict()] }), draft),
    ).toBe("- Met: Outline entity exists");
    expect(
      formatVerifierStatus(
        run({
          gateVerdicts: [
            { ...metVerdict(), met: false, reason: "No outline yet" },
          ],
        }),
        draft,
      ),
    ).toBe("- Not yet met: No outline yet");
  });
});
