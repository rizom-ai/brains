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
          operatorAction: true,
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
  it("compiles authored steps and choices into runtime transitions", () => {
    const markdown = `---
title: Choice Playbook
status: active
audience: anchor
completionMode: agent-confirmed
---

# Playbook

## Purpose

Teach by doing.

## Operating Rules

- Ask one question at a time.

## Steps

### Welcome

Say: Want to set it up together?

Choices:
- Set up Rover → Identity
- Not now → Done

### Identity

Say: What name should Rover remember?

To do:
- Ask for profile details.

Done when:
- Rover knows who the operator is.

Skip: Skip for now → First note

### First note

Say: Send one rough idea.

To do:
- Save it as a note.

Done when:
- A first note has been saved.

### Done

Say: You're set up.
`;

    const { body: parsed } = playbookAdapter.parsePlaybookContent(markdown);

    expect(parsed.initialState).toBe("welcome");
    expect(parsed.finalStates).toEqual(["done"]);
    expect(parsed.states).toEqual([
      {
        id: "welcome",
        title: "Welcome",
        prompt: "Want to set it up together?",
        instructions: [],
        doneWhen: [],
        transitions: [
          {
            event: "CHOICE_1",
            target: "identity",
            label: "Set up Rover",
            description: "Set up Rover",
            operatorAction: true,
          },
          {
            event: "CHOICE_2",
            target: "done",
            label: "Not now",
            description: "Not now",
            operatorAction: true,
          },
        ],
      },
      {
        id: "identity",
        title: "Identity",
        prompt: "What name should Rover remember?",
        instructions: ["Ask for profile details."],
        doneWhen: ["Rover knows who the operator is."],
        transitions: [
          { event: "NEXT", target: "first-note" },
          {
            event: "SKIP",
            target: "first-note",
            label: "Skip for now",
            description: "Skip for now",
            operatorAction: true,
          },
        ],
      },
      {
        id: "first-note",
        title: "First note",
        prompt: "Send one rough idea.",
        instructions: ["Save it as a note."],
        doneWhen: ["A first note has been saved."],
        transitions: [{ event: "NEXT", target: "done" }],
      },
      {
        id: "done",
        title: "Done",
        prompt: "You're set up.",
        instructions: [],
        doneWhen: [],
        transitions: [],
      },
    ]);
  });

  it("rejects authored non-terminal steps without a done goal or choices", () => {
    const markdown = `---
title: Broken
status: active
audience: anchor
completionMode: agent-confirmed
---

# Playbook

## Purpose

Teach by doing.

## Steps

### Intro

Say: Hello.

### Done

Say: Done.
`;

    expect(() => playbookAdapter.parsePlaybookContent(markdown)).toThrow(
      "Playbook step 'Intro' must declare Done when, Choices, or Skip.",
    );
  });

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
