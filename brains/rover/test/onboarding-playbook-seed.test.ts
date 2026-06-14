import { readFile } from "node:fs/promises";
import { describe, expect, it } from "bun:test";
import { playbookAdapter } from "@brains/playbook";

describe("Rover onboarding playbook seed", () => {
  it("compiles readable steps into gated completion and authored choices", async () => {
    const seedMarkdown = await readFile(
      new URL("../seed-content/playbook/rover-onboarding.md", import.meta.url),
      "utf8",
    );
    const { body } = playbookAdapter.parsePlaybookContent(seedMarkdown);
    const welcome = body.states.find((state) => state.id === "welcome");
    const identity = body.states.find((state) => state.id === "identity");
    const firstNote = body.states.find((state) => state.id === "first-note");
    const seeItComeBack = body.states.find(
      (state) => state.id === "see-it-come-back",
    );
    const makeSomething = body.states.find(
      (state) => state.id === "make-something",
    );

    expect(body.initialState).toBe("welcome");
    expect(body.finalStates).toEqual(["done"]);
    expect(welcome?.transitions).toEqual([
      expect.objectContaining({
        event: "CHOICE_1",
        label: "Set up Rover",
        target: "identity",
        operatorAction: true,
      }),
      expect.objectContaining({
        event: "CHOICE_2",
        label: "Not now",
        target: "done",
        operatorAction: true,
      }),
    ]);
    expect(identity?.doneWhen).toEqual([
      "The anchor profile has been created or updated.",
    ]);
    expect(identity?.transitions).toContainEqual({
      event: "NEXT",
      target: "first-note",
    });
    expect(identity?.transitions).toContainEqual(
      expect.objectContaining({
        event: "SKIP",
        label: "Skip for now",
        target: "first-note",
        operatorAction: true,
      }),
    );
    expect(identity?.instructions).toContain(
      'Update the existing anchor profile singleton with system_update using entityType "anchor-profile" and id "anchor-profile".',
    );
    expect(identity?.instructions).toContain(
      "Do not use system_create for anchor-profile; anchor-profile is an existing singleton profile record.",
    );
    expect(firstNote?.doneWhen).toEqual([
      "A first knowledge seed has been saved.",
    ]);
    expect(firstNote?.transitions).toEqual([
      { event: "NEXT", target: "see-it-come-back" },
    ]);
    expect(firstNote?.instructions).toContain(
      'Use "note" as the operator-facing term for base knowledge entries.',
    );
    expect(firstNote?.instructions).toContain(
      "Do not offer to collect another seed during onboarding; guide to the retrieval demonstration next.",
    );
    expect(seeItComeBack?.prompt).toBe(
      "Want me to find that note now, or would you rather ask for it yourself?",
    );
    expect(seeItComeBack?.transitions).toEqual([
      expect.objectContaining({
        event: "CHOICE_1",
        label: "Show me",
        target: "make-something",
        operatorAction: true,
      }),
      expect.objectContaining({
        event: "CHOICE_2",
        label: "I’ll ask",
        target: "make-something",
        operatorAction: true,
      }),
    ]);
    expect(makeSomething?.doneWhen).toEqual([
      "A transformation draft has been created.",
    ]);
    expect(makeSomething?.transitions).toEqual([
      { event: "NEXT", target: "done" },
    ]);
  });
});
