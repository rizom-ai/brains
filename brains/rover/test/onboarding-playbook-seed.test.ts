import { readFile } from "node:fs/promises";
import { describe, expect, it } from "bun:test";
import { playbookAdapter } from "@brains/playbooks";

async function readOnboardingPlaybook(fileName: string): Promise<string> {
  return readFile(
    new URL(
      `../../../plugins/rover-onboarding/content/playbook/${fileName}`,
      import.meta.url,
    ),
    "utf8",
  );
}

describe("Rover onboarding playbook bundle", () => {
  it("compiles readable setup steps into the expected onboarding graph", async () => {
    const seedMarkdown = await readOnboardingPlaybook("rover-onboarding.md");
    const { frontmatter, body } =
      playbookAdapter.parsePlaybookContent(seedMarkdown);
    const statesById = new Map(body.states.map((state) => [state.id, state]));

    expect(frontmatter).toEqual(
      expect.objectContaining({
        trigger: "first-anchor-web-chat",
        lifecycle: "onboarding",
        starterText: "Set up Rover",
        description:
          "Tune Rover's identity and anchor profile before using the knowledge loop.",
        starterPrompt: "Start playbook rover-onboarding.",
      }),
    );
    expect(body.initialState).toBe("brain-identity");
    expect(body.finalStates).toEqual(["done"]);
    expect([...statesById.keys()]).toEqual([
      "brain-identity",
      "anchor-profile",
      "done",
    ]);

    expect(statesById.get("brain-identity")).toEqual(
      expect.objectContaining({
        id: "brain-identity",
        prompt: expect.any(String),
        doneWhen: [expect.any(String)],
        transitions: [{ event: "NEXT", target: "anchor-profile" }],
      }),
    );

    expect(statesById.get("anchor-profile")).toEqual(
      expect.objectContaining({
        id: "anchor-profile",
        prompt: expect.any(String),
        doneWhen: [expect.any(String)],
        transitions: [{ event: "NEXT", target: "done" }],
      }),
    );
    expect(statesById.get("anchor-profile")?.instructions.join("\n")).toContain(
      "Start playbook rover-first-knowledge-loop.",
    );

    expect(body.nextPrompts).toContain(
      "Start playbook rover-first-knowledge-loop.",
    );

    for (const state of body.states) {
      expect(
        state.transitions.every(
          (transition) => transition.operatorAction !== true,
        ),
      ).toBe(true);
    }

    for (const state of body.states.filter(
      (state) => !body.finalStates.includes(state.id),
    )) {
      expect(state.prompt.length).toBeGreaterThan(0);
      expect(state.instructions.length).toBeGreaterThan(0);
    }
  });

  it("compiles readable first-loop steps into the expected onboarding graph", async () => {
    const seedMarkdown = await readOnboardingPlaybook(
      "rover-first-knowledge-loop.md",
    );
    const { frontmatter, body } =
      playbookAdapter.parsePlaybookContent(seedMarkdown);
    const statesById = new Map(body.states.map((state) => [state.id, state]));

    expect(frontmatter).toEqual(
      expect.objectContaining({
        lifecycle: "onboarding",
        starterText: "Save a first idea",
        description:
          "Learn Rover by saving a first idea and seeing how your knowledge becomes reusable.",
        starterPrompt: "Start playbook rover-first-knowledge-loop.",
      }),
    );
    expect(frontmatter.trigger).toBeUndefined();
    expect(body.initialState).toBe("first-note");
    expect(body.finalStates).toEqual(["done"]);
    expect([...statesById.keys()]).toEqual([
      "first-note",
      "retrieve-and-transform",
      "done",
    ]);

    expect(statesById.get("first-note")).toEqual(
      expect.objectContaining({
        id: "first-note",
        prompt: expect.any(String),
        doneWhen: [expect.any(String)],
        transitions: [{ event: "NEXT", target: "retrieve-and-transform" }],
      }),
    );

    const retrieveAndTransform = statesById.get("retrieve-and-transform");
    expect(retrieveAndTransform).toEqual(
      expect.objectContaining({
        id: "retrieve-and-transform",
        prompt: expect.any(String),
        doneWhen: [expect.any(String)],
        transitions: [{ event: "NEXT", target: "done" }],
      }),
    );
    expect(retrieveAndTransform?.instructions.join("\n")).toContain(
      "transform the retrieved note directly in chat",
    );
    expect(retrieveAndTransform?.instructions.join("\n")).toContain(
      "Do not call system_create or system_generate for an outline",
    );

    for (const state of body.states) {
      expect(
        state.transitions.every(
          (transition) => transition.operatorAction !== true,
        ),
      ).toBe(true);
    }

    for (const state of body.states.filter(
      (state) => !body.finalStates.includes(state.id),
    )) {
      expect(state.prompt.length).toBeGreaterThan(0);
      expect(state.instructions.length).toBeGreaterThan(0);
    }
  });
});
