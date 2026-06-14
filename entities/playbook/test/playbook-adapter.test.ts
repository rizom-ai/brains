import { describe, expect, it } from "bun:test";
import {
  playbookAdapter,
  playbookBodyFormatter,
  validatePlaybookBody,
} from "../src";

const body = {
  purpose: "Teach by doing.",
  operatingRules: ["Ask one question at a time."],
  initialState: "welcome",
  states: [
    {
      id: "welcome",
      title: "Welcome",
      prompt: "Welcome. Would you like to continue?",
      instructions: ["Explain the playbook."],
      doneWhen: ["Operator is ready."],
      transitions: [
        {
          event: "NEXT",
          target: "complete",
          label: "Keep going",
          description: "Continue.",
          operatorDescription: "Continue to the next step.",
        },
      ],
    },
    {
      id: "complete",
      title: "Complete",
      instructions: ["Complete the run."],
      doneWhen: ["Run is complete."],
      transitions: [],
    },
  ],
  finalStates: ["complete"],
  nextPrompts: ["Save this idea as a note..."],
};

describe("playbookAdapter", () => {
  it("parses playbook markdown into metadata and structured body", () => {
    const markdown = playbookAdapter.createPlaybookContent(
      {
        title: "Rover Onboarding",
        status: "active",
        audience: "anchor",
        trigger: "first-anchor-web-chat",
        completionMode: "agent-confirmed",
      },
      body,
    );

    const entity = playbookAdapter.fromMarkdown(markdown);
    const parsed = playbookAdapter.parsePlaybookContent(markdown);

    expect(entity.entityType).toBe("playbook");
    expect(entity.metadata).toEqual({
      title: "Rover Onboarding",
      status: "active",
      audience: "anchor",
      trigger: "first-anchor-web-chat",
      completionMode: "agent-confirmed",
    });
    expect(parsed.body).toEqual(body);
  });

  it("round-trips structured playbook bodies", () => {
    const markdown = playbookBodyFormatter.format(body);
    expect(playbookBodyFormatter.parse(markdown)).toEqual(body);
  });

  it("reports structural validation errors", () => {
    const missingInitial = validatePlaybookBody({
      ...body,
      initialState: "missing",
    });
    expect(missingInitial.errors).toContain(
      "Playbook initial state 'missing' is not defined.",
    );

    const result = validatePlaybookBody({
      ...body,
      states: [
        ...body.states,
        {
          id: "welcome",
          title: "Duplicate Welcome",
          instructions: [],
          doneWhen: [],
          transitions: [{ event: "NEXT", target: "missing-target" }],
        },
        {
          id: "orphan",
          title: "Orphan",
          instructions: [],
          doneWhen: [],
          transitions: [],
        },
      ],
      finalStates: ["complete", "missing-final"],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Duplicate playbook state id 'welcome'.");
    expect(result.errors).toContain(
      "Playbook transition 'welcome' -> 'missing-target' targets an undefined state.",
    );
    expect(result.errors).toContain(
      "Playbook final state 'missing-final' is not defined.",
    );
    expect(result.errors).toContain("Playbook state 'orphan' is unreachable.");
  });

  it("rejects structurally invalid playbooks at parse time", () => {
    const welcome = body.states.find((state) => state.id === "welcome");
    const complete = body.states.find((state) => state.id === "complete");
    if (!welcome || !complete) throw new Error("Test fixture is incomplete.");

    const invalidMarkdown = playbookAdapter.createPlaybookContent(
      {
        title: "Broken",
        status: "active",
        audience: "anchor",
        completionMode: "agent-confirmed",
      },
      {
        ...body,
        states: [
          {
            ...welcome,
            transitions: [{ event: "NEXT", target: "missing" }],
          },
          complete,
        ],
      },
    );

    expect(() => playbookAdapter.parsePlaybookContent(invalidMarkdown)).toThrow(
      "targets an undefined state",
    );
  });
});
