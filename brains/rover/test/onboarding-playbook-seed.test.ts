import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "bun:test";
import { playbookAdapter } from "@brains/playbook";

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

    await expect(access(defaultLiveSeed)).rejects.toThrow();
    await expect(access(fullLiveSeed)).rejects.toThrow();
    expect(coreEvalSeed).toBe(coreSeed);
    expect(defaultEvalSeed).toBe(coreSeed);
    expect(fullEvalSeed).toBe(coreSeed);
  });

  it("compiles readable steps into gated completion and authored choices", async () => {
    const seedMarkdown = await readFile(
      new URL(
        "../seed-content-core/playbook/rover-onboarding.md",
        import.meta.url,
      ),
      "utf8",
    );
    const { body } = playbookAdapter.parsePlaybookContent(seedMarkdown);
    const welcome = body.states.find((state) => state.id === "welcome");
    const brainIdentity = body.states.find(
      (state) => state.id === "brain-identity",
    );
    const anchorProfile = body.states.find(
      (state) => state.id === "anchor-profile",
    );
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
        target: "brain-identity",
        operatorAction: true,
      },
      {
        event: "CHOICE_2",
        label: "Not now",
        target: "done",
        operatorAction: true,
      },
    ]);
    expect(brainIdentity?.prompt).toBe(
      "First, let’s tune Rover itself. In one sentence, what should this brain help you do?",
    );
    expect(brainIdentity?.doneWhen).toEqual([
      "The brain character has been updated.",
    ]);
    expect(brainIdentity?.transitions).toContainEqual({
      event: "NEXT",
      target: "anchor-profile",
    });
    expect(brainIdentity?.transitions).toContainEqual({
      event: "SKIP",
      label: "Keep Rover defaults",
      target: "anchor-profile",
      operatorAction: true,
    });
    expect(brainIdentity?.instructions).toContain(
      "Keep this about the brain itself — what Rover is and how it should help — not the operator's personal profile.",
    );
    expect(brainIdentity?.instructions).toContain(
      'Update the existing brain character singleton with system_update using entityType "brain-character" and id "brain-character".',
    );
    expect(brainIdentity?.instructions).toContain(
      "Use a full markdown content replacement with valid frontmatter keys: name, role, purpose, and values (values is a YAML list); do not use fields-only updates for brain-character.",
    );
    expect(anchorProfile?.prompt).toBe(
      "Now let’s tune Rover to you. What should I call you?",
    );
    expect(anchorProfile?.doneWhen).toEqual([
      "The anchor profile has been created or updated.",
    ]);
    expect(anchorProfile?.transitions).toContainEqual({
      event: "NEXT",
      target: "first-note",
    });
    expect(anchorProfile?.transitions).toContainEqual({
      event: "SKIP",
      label: "Skip for now",
      target: "first-note",
      operatorAction: true,
    });
    expect(anchorProfile?.instructions).toContain(
      "If the operator gives multiple details at once, use them; do not re-ask fields already provided.",
    );
    expect(anchorProfile?.instructions).toContain(
      "Ask only for missing essentials, one at a time, in this order: name, role, audience, expertise, tone.",
    );
    expect(anchorProfile?.instructions).toContain(
      "Do not treat a name-only answer as a request to skip; do not send SKIP unless the operator explicitly asks to skip.",
    );
    expect(anchorProfile?.instructions).toContain(
      "Treat a compact list as valid if it covers name, role, audience, expertise, and tone; only ask for genuinely missing or ambiguous information.",
    );
    expect(anchorProfile?.instructions).toContain(
      "When enough details are known, summarize once and call system_update to request approval in the same turn; do not wait for another chat turn before requesting approval.",
    );
    expect(anchorProfile?.instructions).toContain(
      'Update the existing anchor profile singleton with system_update using entityType "anchor-profile" and id "anchor-profile".',
    );
    expect(anchorProfile?.instructions).toContain(
      "Use a full markdown content replacement with only these valid frontmatter keys: name, kind, and description. Anchor profile does not accept brain-character keys such as role, purpose, or values.",
    );
    expect(anchorProfile?.instructions).toContain(
      'Set kind to "professional" for an individual operator, and put role, audience, expertise, and desired tone in description.',
    );
    expect(anchorProfile?.instructions).toContain(
      "Use this exact frontmatter shape for anchor-profile content, with description as a block scalar and not a one-line value: `---`, `name: Ada Morgan`, `kind: professional`, `description: >-`, indented role/audience/expertise/tone lines, then closing `---`.",
    );
    expect(anchorProfile?.instructions).toContain(
      "Write description as a YAML block scalar (`description: >-`) so colons or punctuation inside the description do not break frontmatter parsing.",
    );
    expect(anchorProfile?.instructions).toContain(
      "Do not use fields-only updates for anchor-profile.",
    );
    expect(anchorProfile?.instructions).toContain(
      "When the operator only chooses setup or asks to continue to profile setup, ask the Anchor profile prompt; do not update the profile from existing memory or prior profile data until the operator provides the details to save.",
    );
    expect(anchorProfile?.instructions).toContain(
      "Do not use system_create for anchor-profile; anchor-profile is an existing singleton profile record.",
    );
    expect(firstNote?.doneWhen).toEqual([
      "A first knowledge seed has been saved.",
    ]);
    expect(firstNote?.transitions).toEqual([
      { event: "NEXT", target: "see-it-come-back" },
    ]);
    expect(firstNote?.instructions).toContain(
      'Use "note" as the operator-facing term for note knowledge entries.',
    );
    expect(firstNote?.instructions).toContain(
      "Do not offer to collect another seed during onboarding; guide to the retrieval demonstration next.",
    );
    expect(firstNote?.instructions).toContain(
      "After saving the first seed, say it was saved or captured, then ask whether to find or show that saved note next; do not say you found it before the operator asks for retrieval, and do not ask for another rough idea, link, note, or fragment during onboarding.",
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
      "When offering the next transformation, follow the manual onboarding shape: turn the saved note into something useful. Name core-safe options such as an outline for later writing, a short draft, or a reusable brief; store the result as a note.",
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
      'When the operator picks an option or accepts a suggested angle with wording like "do that", call system_create in that same turn with entityType "note" for the chosen draft artifact.',
    );
    expect(makeSomething?.instructions).toContain(
      "Do not only say you will create the draft; the tool call is the action that should produce the approval request.",
    );
    expect(makeSomething?.instructions).toContain(
      'Do not write the outline, short draft, or brief inline in chat before calling system_create; if the operator says "Do that as an outline", call system_create with entityType "note" for an outline instead of composing it yourself.',
    );
    expect(makeSomething?.instructions).toContain(
      "If the create tool reports the draft is generating or queued, tell the operator it is generating and do not treat it as ready to review yet.",
    );
    expect(makeSomething?.instructions).toContain(
      "After the draft artifact has been created or queued, move onboarding to Done; if it is ready, show it or offer to review it, and if it is still generating, explain it can be reviewed when ready.",
    );
    expect(makeSomething?.doneWhen).toEqual([
      "A transformation draft artifact has been created or queued.",
    ]);
    expect(makeSomething?.transitions).toEqual([
      { event: "NEXT", target: "done" },
    ]);
  });
});
