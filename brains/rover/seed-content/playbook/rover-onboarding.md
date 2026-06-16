---
title: Rover Onboarding
status: active
audience: anchor
trigger: first-anchor-web-chat
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
- Advance steps only after their Done when conditions are satisfied, or when the operator picks an authored choice.
- Runtime evidence from entity creation and updates is attached to the active run automatically where supported.
- Complete the playbook only after the run reaches a final step.

## Steps

### Welcome

Say: Rover is your personal knowledge and publishing brain. It captures rough ideas, finds them later, connects them to themes, and turns them into publishable work. Want to set it up together?

To do:

- Explain Rover as a personal knowledge and publishing brain for an independent professional.
- Explain that setup is a short guided apprenticeship, not a form.

Choices:

- Set up Rover → Identity
- Not now → Done

### Identity

Say: Let’s tune Rover to you. What should I call you?

To do:

- Learn enough about the operator to create or update the anchor profile: name, role, audience, expertise, and desired tone.
- Ask only for missing essentials, one at a time, in this order: name, role, audience, expertise, tone.
- If the operator gives multiple details at once, use them; do not re-ask fields already provided.
- Treat a compact list as valid if it covers name, role, audience, expertise, and tone; only ask for genuinely missing or ambiguous information.
- When enough details are known, summarize once and ask for confirmation before saving.
- When the operator only chooses setup or asks to continue to identity setup, ask the Identity prompt; do not update the profile from existing memory or prior profile data until the operator provides the details to save.
- Update the existing anchor profile singleton with system_update using entityType "anchor-profile" and id "anchor-profile".
- Do not use system_create for anchor-profile; anchor-profile is an existing singleton profile record.
- After saving, explain that Rover uses identity to shape answers, site content, and publishing workflows.

Done when:

- The anchor profile has been created or updated.

Skip: Skip for now → First note

### First note

Say: Now let’s save one useful seed. Send me a rough idea, note, link, or fragment you want Rover to remember.

To do:

- Ask for one rough idea, note, link, or fragment the operator wants Rover to remember.
- Save it as the appropriate durable entity, usually a note or link.
- Use "note" as the operator-facing term for base knowledge entries.
- Do not offer to collect another seed during onboarding; guide to the retrieval demonstration next.
- After saving the first seed, ask whether to find or show that saved note next; do not ask for another rough idea, link, note, or fragment during onboarding.
- Explain that rough ideas become reusable markdown knowledge inside Rover.
- Explain how Rover can retrieve, connect, summarize, and repurpose it later.

Done when:

- A first knowledge seed has been saved.

### See it come back

Say: Want me to find that note now, or would you rather ask for it yourself?

To do:

- At the start of this step, ask only whether to find/show the saved note or let the operator ask for it themselves; do not offer to collect another note, seed, link, idea, or fragment.
- If the operator asks to see, find, or show the saved note, retrieve or reference it through normal tools, then continue to Make something in the same turn.
- If the operator chooses the Show me action in chat, send the Show me event and retrieve the saved note with system_get or system_search before saying you found it; do not rely only on conversation memory.
- If the operator says they will ask, explain they can search their own knowledge in natural language, then continue to Make something.
- Do not stop after retrieval; end by offering the transformation options from Make something.
- When offering the next transformation, name concrete options such as blog post outline, social draft, and newsletter idea; do not end with only a generic statement that drafts are possible.
- Explain the flywheel: more stored knowledge makes future answers and drafts more useful.

Choices:

- Show me → Make something
- I’ll ask → Make something

### Make something

Say: Let’s turn your raw knowledge into something useful — a blog post outline, a social draft, a newsletter idea, a topic suggestion, or a project angle. Which would you like?

To do:

- Offer two or three transformations: blog post outline, social draft, newsletter idea, topic suggestion, or project angle.
- Create a draft entity only after the operator chooses one.
- When the operator picks an option or accepts a suggested angle with wording like "do that", call system_create in that same turn for the chosen draft type.
- Do not only say you will create the draft; the tool call is the action that should produce the approval request.
- Do not write the outline, social draft, newsletter idea, topic suggestion, or project angle inline in chat before calling system_create; if the operator says "Do that as a post outline", call system_create for a post outline instead of composing the outline yourself.
- If the create tool reports the draft is generating or queued, tell the operator it is generating and do not treat the draft as ready to review yet.
- After the draft is ready, show it or offer to review it before moving on.
- Explain how Rover helps move from raw thinking to public output without leaving the brain.
- Do not publish anything unless the operator explicitly asks and confirms the publishing action.

Done when:

- A transformation draft is ready to review.

### Done

Say: You’re set up. You can keep using Rover to save ideas, retrieve what you know, transform notes into drafts, and manage publishing work whenever you are ready.

To do:

- Give a short list of useful next prompts.
- Remind the operator they can keep using chat to save, retrieve, transform, and manage knowledge.

## Next Prompts

- Save this idea as a note...
- Turn my latest note into a post outline.
- What topics am I circling lately?
- Draft a LinkedIn post from this essay.
- Show me what is ready to publish.
