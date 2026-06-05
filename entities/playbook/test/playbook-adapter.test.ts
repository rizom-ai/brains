import { describe, expect, it } from "bun:test";
import { playbookAdapter, playbookBodyFormatter } from "../src";

const body = {
  purpose: "Teach by doing.",
  operatingRules: ["Ask one question at a time."],
  initialState: "welcome",
  states: [
    {
      id: "welcome",
      title: "Welcome",
      instructions: ["Explain the playbook."],
      completionCriteria: ["Operator is ready."],
      expectedEntities: [],
      transitions: [
        {
          event: "NEXT",
          target: "complete",
          description: "Continue.",
        },
      ],
    },
    {
      id: "complete",
      title: "Complete",
      instructions: ["Complete the run."],
      completionCriteria: ["Run is complete."],
      expectedEntities: [],
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
});
