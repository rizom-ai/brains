---
title: Rover First Knowledge Loop
status: active
audience: anchor
lifecycle: onboarding
starterText: Save a first idea
description: Learn Rover by saving a first idea and seeing how your knowledge becomes reusable.
starterPrompt: Start playbook rover-first-knowledge-loop.
completionMode: agent-confirmed
---

# Playbook

## Purpose

Teach the operator how Rover works by saving one useful seed, retrieving it, and transforming it into working material.

## Operating Rules

- Ask one question at a time.
- Teach Rover by doing real actions.
- Use existing tools to save useful information as durable entities.
- After meaningful tool actions, explain what Rover just did and why it matters.
- Do not publish anything unless the operator explicitly asks and confirms the publishing action.
- Advance steps only after their Done when conditions are satisfied.
- Runtime evidence from entity creation and updates is attached to the active run automatically where supported.
- Complete the playbook only after the run reaches a final step.
- Do not present non-exit playbook actions as buttons or scripted choices; show progress through the current step and continue through normal chat.

## Steps

### First note

Say: Now let’s save one useful seed. Send me a rough idea, note, link, or fragment you want Rover to remember.

To do:

- Ask for one rough idea, note, link, or fragment the operator wants Rover to remember.
- Save it as the appropriate durable entity, usually a note or link.
- For a rough idea or fragment saved as the first note, call system_create with `source: { kind: "text", content }`; do not use a generate source and do not turn the seed into an async generated draft.
- Use "note" as the operator-facing term for note knowledge entries.
- Do not offer to collect another seed during this playbook; guide to the retrieval and transformation demonstration next.
- After saving the first seed, say it was saved or captured, then ask the operator to find/show that saved note next; do not say you found it before the operator asks for retrieval, and do not ask for another rough idea, link, note, or fragment during this playbook.
- Explain that rough ideas become reusable markdown knowledge inside Rover.
- Explain the first loop clearly: rough thought → durable knowledge → retrieval → transformation.

Done when:

- A first knowledge seed has been saved.

### Retrieve and transform

Say: Ask me to find that note now. After we bring it back, we’ll turn it into something useful — an outline for later writing, a short draft, or a reusable brief.

To do:

- At the start of this step, ask the operator to find/show the saved note; do not offer to collect another note, seed, link, idea, or fragment.
- If the operator asks to see, find, or show the saved note, retrieve it with system_get or system_search before saying you found it; do not rely only on conversation memory or playbook evidence.
- Prefer system_get with the saved note title/slug from the confirmed create result when the note title is known; use system_search only when the identifier is genuinely unclear.
- Every retrieval response in this step must end by offering the transformation choices: an outline for later writing, a short draft, or a reusable brief.
- After retrieval, explain the flywheel: more stored knowledge makes future answers and drafts more useful.
- When the operator picks an option or accepts a suggested angle with wording like "do that", transform the retrieved note directly in chat.
- Do not call system_create for an outline, short draft, or reusable brief unless the operator explicitly asks to save, store, create, or persist it as a durable entity.
- Do not ask for confirmation for an inline transformation.
- If the operator asks "Do that as an outline", write the outline in the response instead of creating a note.
- After the chat transformation, say the onboarding loop is complete: Rover saved a seed, retrieved it, and transformed it into useful working material.
- Do not publish anything unless the operator explicitly asks and confirms the publishing action.

Done when:

- The saved note has been retrieved and transformed in chat.

### Done

Say: You’re set up. Rover now has a first memory it can retrieve and transform.

To do:

- Explain the Rover loop: save, retrieve, connect, transform, and manage publishing work.
- Give a short list of useful next prompts.
- Remind the operator they can keep using chat to save, retrieve, transform, and manage knowledge.

## Next Prompts

- Save this idea as a note...
- Turn my latest note into an outline.
- What topics am I circling lately?
- Draft a LinkedIn post from this essay.
- Show me what is ready to publish.
