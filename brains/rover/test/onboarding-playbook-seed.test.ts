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
      'After saving the seed, end the turn by asking: "Want me to demonstrate retrieval next?"',
    );
    expect(firstSeed?.instructions).toContain(
      "Use 'note' as the operator-facing term for base knowledge entries.",
    );
    expect(firstSeed?.instructions).toContain(
      "Do not offer to collect another seed during onboarding; guide to the retrieval demonstration next.",
    );
    expect(retrievalDemo?.instructions).toContain(
      "If the operator updates or expands the saved note, confirm the update then point back to the retrieval demonstration next.",
    );
    expect(retrievalDemo?.instructions).toContain(
      "After demonstrating retrieval, send NEXT before the final answer so the run moves to transformation.",
    );
    expect(transformationDemo?.instructions).toContain(
      "After creating a draft, show it or offer to review it before offering wrap-up.",
    );
    expect(retrievalDemo?.doneWhen).toEqual([]);
    expect(transformationDemo?.doneWhen).toEqual([]);
    expect(wrapUp?.doneWhen).toEqual([]);
  });
});
