---
title: Rover Onboarding
status: active
audience: anchor
trigger: first-anchor-web-chat
lifecycle: onboarding
starterText: Set up Rover
description: Learn Rover by saving a first idea and seeing how your knowledge becomes reusable.
starterPrompt: Start playbook rover-onboarding.
completionMode: agent-confirmed
---

# Playbook

## Purpose

Teach the operator how Rover works by doing useful setup work — not by being an intake form.

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

### Brain identity

Say: Rover is your personal knowledge and publishing brain. It captures rough ideas, finds them later, connects them to themes, and turns them into publishable work. First, let’s tune Rover itself. In one sentence, what should this brain help you do?

To do:

- Explain Rover as a personal knowledge and publishing brain for an independent professional.
- Explain that setup is a short guided apprenticeship, not a form.
- Explain that setup tunes two things first: this brain's identity, then the operator's anchor profile.
- Help the operator define the brain's identity: name, role, purpose, and values.
- Keep this about the brain itself — what Rover is and how it should help — not the operator's personal profile.
- Do not infer brain identity details from the playbook welcome text, ambient memory, or existing brain-character when the operator has not provided details in this run.
- If the operator asks to continue/next but explicitly says they have not provided brain identity details, ask the Brain identity prompt again and do not call any tools.
- If the operator gives a compact description, infer reasonable role, purpose, and values from it; ask only for genuinely missing or ambiguous information.
- When enough details are known, summarize once and call system_update to request approval in the same turn; do not wait for another chat turn before requesting approval.
- Update the existing brain character singleton with system_update using entityType "brain-character" and id "brain-character".
- Use a full markdown content replacement with valid frontmatter keys: name, role, purpose, and values (values is a YAML list); do not use fields-only updates for brain-character.
- Do not use system_create for brain-character; brain-character is an existing singleton identity record.
- After saving, explain that Rover uses brain identity to introduce itself, frame its work, and keep a consistent style.

Done when:

- The brain character has been updated.

### Anchor profile

Say: Now let’s tune Rover to you. What should I call you?

To do:

- Learn enough about the operator to create or update the anchor profile: name, role, audience, expertise, and desired tone.
- Ask only for missing essentials, one at a time, in this order: name, role, audience, expertise, tone.
- A name by itself is not enough to update the profile; after receiving only a name, ask for the operator's role next and do not call any tools.
- This name-only rule is a hard block: do not call system_update, do not request confirmation, and do not advance the playbook after a name-only answer.
- Do not update the anchor profile until name, role, audience, expertise, and tone have all been provided in the current onboarding run.
- If the operator gives multiple details at once, use them; do not re-ask fields already provided.
- Treat a compact list as valid if it covers name, role, audience, expertise, and tone; only ask for genuinely missing or ambiguous information.
- When enough details are known, summarize once and call system_update to request approval in the same turn; do not wait for another chat turn before requesting approval.
- When the operator only asks to continue to profile setup, ask the Anchor profile prompt; do not update the profile from existing memory or prior profile data until the operator provides the details to save.
- Update the existing anchor profile singleton with system_update using entityType "anchor-profile" and id "anchor-profile".
- Use a full markdown content replacement. Anchor profile accepts its base keys plus extension frontmatter keys preserved by the adapter; do not use brain-character keys such as purpose or values.
- Set kind to "professional" for an individual operator.
- Store onboarding essentials as structured frontmatter keys: name, kind, role, audience, expertise, and desiredTone.
- `kind: professional` is required. Never call system_update for anchor-profile if the replacement content omits kind.
- `expertise` must be a YAML list, even when the operator gives one expertise phrase. Never call system_update for anchor-profile if expertise is a one-line string.
- Use this exact frontmatter shape for anchor-profile content: `---`, `name: Ada Morgan`, `kind: professional`, `role: advisor`, `audience: climate-tech founders`, `expertise:`, `  - resilient software systems`, `desiredTone: clear, practical, quietly confident`, then closing `---`.
- Do not use fields-only updates for anchor-profile.
- Do not use system_create for anchor-profile; anchor-profile is an existing singleton profile record.
- After saving, explain that Rover uses the anchor profile to shape answers, site content, and publishing workflows around the operator.

Done when:

- The anchor profile has been created or updated.

### First note

Say: Now let’s save one useful seed. Send me a rough idea, note, link, or fragment you want Rover to remember.

To do:

- Ask for one rough idea, note, link, or fragment the operator wants Rover to remember.
- Save it as the appropriate durable entity, usually a note or link.
- For a rough idea or fragment saved as the first note, call system_create with direct note content; do not include a generation prompt and do not turn the seed into an async generated draft.
- Use "note" as the operator-facing term for note knowledge entries.
- Do not offer to collect another seed during onboarding; guide to the retrieval and transformation demonstration next.
- After saving the first seed, say it was saved or captured, then ask the operator to find/show that saved note next; do not say you found it before the operator asks for retrieval, and do not ask for another rough idea, link, note, or fragment during onboarding.
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
- Create the chosen artifact only after the operator chooses one; in core, store it as a note entity.
- When the operator picks an option or accepts a suggested angle with wording like "do that", call system_create in that same turn with entityType "note" for the chosen draft artifact.
- Do not only say you will create the draft; the tool call is the action that should produce the approval request.
- A response to "Do that as..." or another transformation choice must include system_create; a search-only, retrieval-only, or explanation-only response is not sufficient.
- Do not write the outline, short draft, or brief inline in chat before calling system_create; if the operator says "Do that as an outline", call system_create with entityType "note" for an outline instead of composing it yourself.
- If the create tool reports the draft is generating or queued, tell the operator it is generating and do not treat it as ready to review yet.
- After the draft artifact has been created or queued, move onboarding to Done; if it is ready, show it or offer to review it, and if it is still generating, explain it can be reviewed when ready.
- Do not publish anything unless the operator explicitly asks and confirms the publishing action.

Done when:

- A transformation draft artifact has been created or queued.

### Done

Say: You’re set up. Rover now has a clear identity, an anchor profile for you, and a first memory it can retrieve and transform.

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
