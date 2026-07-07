---
title: Rover Onboarding
status: active
audience: anchor
trigger: first-anchor-web-chat
lifecycle: onboarding
starterText: Set up Rover
description: Tune Rover's identity and anchor profile before using the knowledge loop.
starterPrompt: Start playbook rover-onboarding.
completionMode: agent-confirmed
---

# Playbook

## Purpose

Set up Rover's durable identity and anchor profile so future knowledge and publishing work has the right frame.

## Operating Rules

- Ask one question at a time.
- Teach Rover by doing real setup work.
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
- If the operator says "Rover should..." or asks to tune Rover's brain identity, treat Rover as the brain name and the supplied description/values as enough identity detail unless role, purpose, and values are genuinely absent.
- When enough details are known, summarize once and call system_update to request approval in the same turn; do not wait for another chat turn before requesting approval.
- Update the existing brain character singleton with system_update using entityType "brain-character" and id "brain-character".
- Use a full markdown content replacement with valid frontmatter keys: name, role, purpose, and values (values is a YAML list); do not use fields-only updates for brain-character.
- Do not use system_create for brain-character; brain-character is an existing singleton identity record.
- After saving, explain that Rover uses brain identity to introduce itself, frame its work, and keep a consistent style.

Done when:

- The brain character has been updated.

### Anchor profile

Say: Now let’s tune Rover to you. What should I call you?

Required details:

- name
- role
- audience
- expertise
- desiredTone

To do:

- Learn enough about the operator to create or update the anchor profile: name, role, audience, expertise, and desired tone.
- Ask only for missing essentials, one at a time, in this order: name, role, audience, expertise, tone.
- A name by itself is not enough to update the profile; after receiving only a name, ask for the operator's role next and do not call any tools.
- This name-only rule is a hard block: do not call system_update, do not request confirmation, and do not advance the playbook after a name-only answer.
- Do not update the anchor profile until name, role, audience, expertise, and tone have all been provided in the current onboarding run.
- If the operator gives multiple details at once, use them; do not re-ask fields already provided.
- Treat a compact list as valid if it covers name, role, audience, expertise, and tone; only ask for genuinely missing or ambiguous information.
- When enough details are known, summarize once and call system_update to request approval in the same turn; do not wait for another chat turn before requesting approval.
- Construct the required full markdown replacement yourself from the operator's natural-language details; never ask the operator to resend full markdown when they already provided name, role, audience, expertise, and tone.
- When the operator only asks to continue to profile setup, ask the Anchor profile prompt; do not update the profile from existing memory or prior profile data until the operator provides the details to save.
- Update the existing anchor profile singleton with system_update using entityType "anchor-profile" and id "anchor-profile".
- Use the `content` argument with a full markdown replacement; never use `fields` for anchor-profile during this playbook. Anchor profile accepts its base keys plus extension frontmatter keys preserved by the adapter; do not use brain-character keys such as purpose or values.
- Set kind to "professional" for an individual operator.
- Store onboarding essentials as structured frontmatter keys: name, kind, role, audience, expertise, and desiredTone.
- `kind: professional` is required. Never call system_update for anchor-profile if the replacement content omits kind.
- `expertise` must be a YAML list, even when the operator gives one expertise phrase. Never call system_update for anchor-profile if expertise is a one-line string.
- Use this exact frontmatter shape for anchor-profile content, substituting only details the operator provided in the current onboarding run: `---`, `name: <provided name>`, `kind: professional`, `role: <provided role>`, `audience: <provided audience>`, `expertise:`, `  - <provided expertise>`, `desiredTone: <provided tone>`, then closing `---`. Do not copy placeholder or example values into the profile.
- Do not use fields-only updates for anchor-profile.
- Do not use system_create for anchor-profile; anchor-profile is an existing singleton profile record.
- After saving, explain that Rover uses the anchor profile to shape answers, site content, and publishing workflows around the operator.
- After the profile is saved and the setup playbook is complete, offer the next playbook by saying the operator can continue with `Start playbook rover-first-knowledge-loop.` to save, retrieve, and transform a first idea.

Done when:

- The anchor profile has been created or updated.

### Done

Say: You’re set up. Rover now has a clear identity and an anchor profile for you. Next, say `Start playbook rover-first-knowledge-loop.` when you want to save, retrieve, and transform a first idea.

To do:

- Explain that this setup playbook tuned Rover's identity and the operator's anchor profile.
- Explain the Rover loop briefly: save, retrieve, connect, transform, and manage publishing work.
- Offer the first knowledge loop as the next guided playbook instead of continuing it inside this setup playbook.
- Give a short list of useful next prompts.
- Remind the operator they can keep using chat to save, retrieve, transform, and manage knowledge.

## Next Prompts

- Start playbook rover-first-knowledge-loop.
- Save this idea as a note...
- Turn my latest note into an outline.
- What topics am I circling lately?
- Draft a LinkedIn post from this essay.
- Show me what is ready to publish.
