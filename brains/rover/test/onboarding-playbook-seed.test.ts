import { readFile } from "node:fs/promises";
import { describe, expect, it } from "bun:test";
import { playbookAdapter } from "@brains/playbook";

describe("Rover onboarding playbook seed", () => {
  it("keeps only entity-evidence-backed onboarding states gated", async () => {
    const seedMarkdown = await readFile(
      new URL("../seed-content/playbook/rover-onboarding.md", import.meta.url),
      "utf8",
    );
    const { body } = playbookAdapter.parsePlaybookContent(seedMarkdown);
    const identity = body.states.find((state) => state.id === "identity");
    const firstSeed = body.states.find(
      (state) => state.id === "first-knowledge-seed",
    );
    const retrievalDemo = body.states.find(
      (state) => state.id === "retrieval-demo",
    );
    const transformationDemo = body.states.find(
      (state) => state.id === "transformation-demo",
    );
    const wrapUp = body.states.find((state) => state.id === "wrap-up");

    expect(identity?.doneWhen).toEqual([
      "The anchor profile has been created or updated.",
    ]);
    expect(firstSeed?.doneWhen).toEqual([
      "A first knowledge seed has been saved.",
    ]);
    expect(firstSeed?.instructions).toContain(
      "After saving the seed, close by offering to demonstrate retrieval next.",
    );
    expect(retrievalDemo?.doneWhen).toEqual([]);
    expect(transformationDemo?.doneWhen).toEqual([]);
    expect(wrapUp?.doneWhen).toEqual([]);
  });
});
