import { describe, it, expect } from "bun:test";
import { playbookBodySchema, type PlaybookBody } from "../src/entity";
import { createPlaybookRun, type PlaybookRun } from "../src/run-store";
import { getState } from "../src/lib/run-machine";
import { buildInstructions, renderAgentContextItem } from "../src/lib/render";

const body: PlaybookBody = playbookBodySchema.parse({
  purpose: "Test playbook",
  initialState: "draft",
  states: [
    {
      id: "draft",
      title: "Draft",
      prompt: "What should the outline cover?",
      instructions: ["Collect the outline"],
      requiredDetails: ["outline topic"],
      doneWhen: ["outline saved"],
      transitions: [
        { event: "NEXT", target: "review" },
        {
          event: "SKIP",
          target: "done",
          operatorAction: true,
          label: "Skip the draft",
        },
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

const draft = getState(body, "draft");
if (!draft) throw new Error("fixture draft state missing");

function run(overrides?: Partial<PlaybookRun>): PlaybookRun {
  const base = createPlaybookRun({
    playbookId: "test-playbook",
    playbookVersion: "hash-1",
    initialState: "draft",
  });
  return { ...base, ...overrides };
}

describe("renderAgentContextItem", () => {
  it("renders title, prompt, sections, and provenance", () => {
    const active = run({ completedStates: ["intro"] });
    const item = renderAgentContextItem({
      run: active,
      body,
      state: draft,
      playbookTitle: "Onboarding",
    });

    expect(item.id).toBe(active.id);
    expect(item.source).toBe("active-playbook");
    expect(item.title).toBe("Onboarding — state: Draft");
    expect(item.content).toContain(
      "Operator-facing prompt: What should the outline cover?",
    );
    expect(item.content).toContain("Completed states:\n- intro");
    expect(item.content).toContain("Required details:\n- outline topic");
    expect(item.content).toContain(
      "Available operator actions:\n- SKIP -> done: Skip the draft",
    );
    expect(item.provenance).toEqual({
      playbookId: "test-playbook",
      runId: active.id,
      currentState: "draft",
      validEvents: [],
      operatorActions: ["SKIP"],
    });
  });
  it("renders goal status and the transition sections", () => {
    const item = renderAgentContextItem({
      run: run(),
      body,
      state: draft,
      playbookTitle: "Onboarding",
    });

    expect(item.content).toContain(
      "State instructions:\n- Collect the outline",
    );
    expect(item.content).toContain("Done when:\n- outline saved");
    expect(item.content).toContain(
      "Goal status:\n- Not yet met: outline saved",
    );
    // Gated NEXT is blocked until a verdict; SKIP is an operator action.
    expect(item.content).toContain("Valid continuation events:\n- none");
    expect(item.content).toContain("Blocked events:\n- NEXT -> review");
  });

  it("reports a met verdict and unblocks NEXT", () => {
    const satisfied = run({
      gateVerdicts: [
        {
          stateId: "draft",
          goal: ["outline saved"],
          met: true,
          reason: "Outline entity exists",
          evaluatedAt: "2026-07-06T00:00:00.000Z",
        },
      ],
    });
    const item = renderAgentContextItem({
      run: satisfied,
      body,
      state: draft,
      playbookTitle: "Onboarding",
    });

    expect(item.content).toContain(
      "Goal status:\n- Met: Outline entity exists",
    );
    expect(item.content).toContain(
      "Valid continuation events:\n- NEXT -> review",
    );
    expect(item.content).toContain("Blocked events:\n- none");
  });

  it("carries the event selection rules for blocked and gated events", () => {
    const item = renderAgentContextItem({
      run: run(),
      body,
      state: draft,
      playbookTitle: "Onboarding",
    });

    expect(item.content).toContain(
      "Blocked events are not valid events; do not call playbook_manage action=send-event with a blocked event.",
    );
    expect(item.content).toContain(
      "For gated durable states, operator-provided details are not enough to send NEXT; first complete the required system_create/system_update/system_delete action or use existing current-run evidence that the Done When condition has already been met.",
    );
  });
});

describe("buildInstructions", () => {
  it("summarizes configured lifecycle playbooks", () => {
    const instructions = buildInstructions({
      onboarding: { playbookId: "onboarding-v1", trigger: "first-run" },
    });
    expect(instructions).toContain(
      "- onboarding: playbookId=onboarding-v1, trigger=first-run",
    );
  });

  it("renders none when no lifecycle playbooks are configured", () => {
    expect(buildInstructions({})).toContain("- none");
  });
});
