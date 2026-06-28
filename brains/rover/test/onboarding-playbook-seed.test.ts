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

async function readRoverFile(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

describe("Rover onboarding playbook seed", () => {
  it("uses core seed playbooks as the live onboarding sources", async () => {
    const playbookFiles = [
      "rover-onboarding.md",
      "rover-first-knowledge-loop.md",
    ];

    for (const file of playbookFiles) {
      const coreSeed = await readRoverFile(
        `../seed-content-core/playbook/${file}`,
      );
      const defaultLiveSeed = new URL(
        `../seed-content-default/playbook/${file}`,
        import.meta.url,
      );
      const fullLiveSeed = new URL(
        `../seed-content-full/playbook/${file}`,
        import.meta.url,
      );
      const coreEvalSeed = await readRoverFile(
        `../eval-content-core/playbook/${file}`,
      );
      const defaultEvalSeed = await readRoverFile(
        `../eval-content-default/playbook/${file}`,
      );
      const fullEvalSeed = await readRoverFile(
        `../eval-content-full/playbook/${file}`,
      );

      await expectMissing(defaultLiveSeed);
      await expectMissing(fullLiveSeed);
      expect(coreEvalSeed).toBe(coreSeed);
      expect(defaultEvalSeed).toBe(coreSeed);
      expect(fullEvalSeed).toBe(coreSeed);
    }
  });

  it("compiles readable setup steps into the expected onboarding graph", async () => {
    const seedMarkdown = await readRoverFile(
      "../seed-content-core/playbook/rover-onboarding.md",
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
    const seedMarkdown = await readRoverFile(
      "../seed-content-core/playbook/rover-first-knowledge-loop.md",
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
