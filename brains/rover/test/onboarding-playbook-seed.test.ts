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
      {
        event: "CHOICE_1",
        label: "Set up Rover",
        target: "identity",
        operatorAction: true,
      },
      {
        event: "CHOICE_2",
        label: "Not now",
        target: "done",
        operatorAction: true,
      },
    ]);
    expect(identity?.prompt).toBe(
      "Let’s tune Rover to you. What should I call you?",
    );
    expect(identity?.doneWhen).toEqual([
      "The anchor profile has been created or updated.",
    ]);
    expect(identity?.transitions).toContainEqual({
      event: "NEXT",
      target: "first-note",
    });
    expect(identity?.transitions).toContainEqual({
      event: "SKIP",
      label: "Skip for now",
      target: "first-note",
      operatorAction: true,
    });
    expect(identity?.instructions).toContain(
      "If the operator gives multiple details at once, use them; do not re-ask fields already provided.",
    );
    expect(identity?.instructions).toContain(
      "Ask only for missing essentials, one at a time, in this order: name, role, audience, expertise, tone.",
    );
    expect(identity?.instructions).toContain(
      "Treat a compact list as valid if it covers name, role, audience, expertise, and tone; only ask for genuinely missing or ambiguous information.",
    );
    expect(identity?.instructions).toContain(
      "When enough details are known, summarize once and ask for confirmation before saving.",
    );
    expect(identity?.instructions).toContain(
      'Update the existing anchor profile singleton with system_update using entityType "anchor-profile" and id "anchor-profile".',
    );
    expect(identity?.instructions).toContain(
      "When the operator only chooses setup or asks to continue to identity setup, ask the Identity prompt; do not update the profile from existing memory or prior profile data until the operator provides the details to save.",
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
    expect(firstNote?.instructions).toContain(
      "After saving the first seed, ask whether to find or show that saved note next; do not ask for another rough idea, link, note, or fragment during onboarding.",
    );
    expect(seeItComeBack?.prompt).toBe(
      "Want me to find that note now, or would you rather ask for it yourself?",
    );
    expect(seeItComeBack?.instructions).toContain(
      "If the operator asks to see, find, or show the saved note, retrieve or reference it through normal tools, then continue to Make something in the same turn.",
    );
    expect(seeItComeBack?.instructions).toContain(
      "Do not stop after retrieval; end by offering the transformation options from Make something.",
    );
    expect(seeItComeBack?.instructions).toContain(
      "When offering the next transformation, follow the manual onboarding shape: turn the saved note into something useful. Name core-safe options such as an outline, short draft, or reusable brief; store the result as a note.",
    );
    expect(seeItComeBack?.instructions).toContain(
      "If the operator chooses the Show me action in chat, send the Show me event and retrieve the saved note with system_get or system_search before saying you found it; do not rely only on conversation memory.",
    );
    expect(seeItComeBack?.instructions).toContain(
      "At the start of this step, ask only whether to find/show the saved note or let the operator ask for it themselves; do not offer to collect another note, seed, link, idea, or fragment.",
    );
    expect(seeItComeBack?.transitions).toEqual([
      {
        event: "CHOICE_1",
        label: "Show me",
        target: "make-something",
        operatorAction: true,
      },
      {
        event: "CHOICE_2",
        label: "I’ll ask",
        target: "make-something",
        operatorAction: true,
      },
    ]);
    expect(makeSomething?.instructions).toContain(
      'When the operator picks an option or accepts a suggested angle with wording like "do that", call system_create in that same turn with entityType "base" for the chosen draft artifact.',
    );
    expect(makeSomething?.instructions).toContain(
      "Do not only say you will create the draft; the tool call is the action that should produce the approval request.",
    );
    expect(makeSomething?.instructions).toContain(
      'Do not write the outline, short draft, or brief inline in chat before calling system_create; if the operator says "Do that as an outline", call system_create with entityType "base" for an outline instead of composing it yourself.',
    );
    expect(makeSomething?.instructions).toContain(
      "If the create tool reports the draft is generating or queued, tell the operator it is generating and do not treat it as ready to review yet.",
    );
    expect(makeSomething?.doneWhen).toEqual([
      "A transformation draft is ready to review.",
    ]);
    expect(makeSomething?.transitions).toEqual([
      { event: "NEXT", target: "done" },
    ]);
  });
});
