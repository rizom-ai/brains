import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "bun:test";
import { playbookAdapter } from "@brains/playbook";

async function expectMissing(path: URL): Promise<void> {
  let missing = false;
  try {
    await access(path);
  } catch {
    missing = true;
  }
  expect(missing).toBe(true);
}

describe("Rover onboarding playbook seed", () => {
  it("uses the core seed playbook as the single live onboarding source", async () => {
    const coreSeed = await readFile(
      new URL(
        "../seed-content-core/playbook/rover-onboarding.md",
        import.meta.url,
      ),
      "utf8",
    );
    const defaultLiveSeed = new URL(
      "../seed-content-default/playbook/rover-onboarding.md",
      import.meta.url,
    );
    const fullLiveSeed = new URL(
      "../seed-content-full/playbook/rover-onboarding.md",
      import.meta.url,
    );
    const coreEvalSeed = await readFile(
      new URL(
        "../eval-content-core/playbook/rover-onboarding.md",
        import.meta.url,
      ),
      "utf8",
    );
    const defaultEvalSeed = await readFile(
      new URL(
        "../eval-content-default/playbook/rover-onboarding.md",
        import.meta.url,
      ),
      "utf8",
    );
    const fullEvalSeed = await readFile(
      new URL(
        "../eval-content-full/playbook/rover-onboarding.md",
        import.meta.url,
      ),
      "utf8",
    );

    await expectMissing(defaultLiveSeed);
    await expectMissing(fullLiveSeed);
    expect(coreEvalSeed).toBe(coreSeed);
    expect(defaultEvalSeed).toBe(coreSeed);
    expect(fullEvalSeed).toBe(coreSeed);
  });

  it("compiles readable steps into the expected onboarding graph", async () => {
    const seedMarkdown = await readFile(
      new URL(
        "../seed-content-core/playbook/rover-onboarding.md",
        import.meta.url,
      ),
      "utf8",
    );
    const { frontmatter, body } =
      playbookAdapter.parsePlaybookContent(seedMarkdown);
    const statesById = new Map(body.states.map((state) => [state.id, state]));

    expect(frontmatter).toEqual(
      expect.objectContaining({
        trigger: "first-anchor-web-chat",
        lifecycle: "onboarding",
        starterText: "Set up Rover",
        description:
          "Learn Rover by saving a first idea and seeing how your knowledge becomes reusable.",
        starterPrompt: "Start playbook rover-onboarding.",
      }),
    );
    expect(body.initialState).toBe("brain-identity");
    expect(body.finalStates).toEqual(["done"]);
    expect([...statesById.keys()]).toEqual([
      "brain-identity",
      "anchor-profile",
      "first-note",
      "retrieve-and-transform",
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
        transitions: [{ event: "NEXT", target: "first-note" }],
      }),
    );

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
      "Do not call system_create for an outline",
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
