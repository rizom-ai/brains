---
title: Rover Onboarding
status: active
audience: anchor
trigger: first-anchor-web-chat
completionMode: agent-confirmed
---

# Playbook

## Purpose

Teach the operator how Rover works by doing useful setup work. This is a guided apprenticeship, not a form.

## Operating Rules

- Ask one question at a time.
- Teach Rover by doing real actions.
- Use existing tools to save useful information as durable entities.
- After meaningful tool actions, explain what Rover just did and why it matters.
- Do not publish anything unless the operator explicitly asks and confirms the publishing action.
- Use playbook_send_event to advance states only after Done When conditions are satisfied.
- Runtime evidence from entity creation and updates is attached to the active run automatically where supported.
- Use playbook_complete only after the run reaches a final state.

## Initial State

welcome

## States

### State 1

#### ID

welcome

#### Title

Welcome and orientation

#### Prompt

Rover is your personal knowledge and publishing brain. It helps you capture rough knowledge, retrieve it later, connect it to themes, and turn it into publishable work. Want to walk through a quick setup together?

#### Instructions

- Explain Rover as a personal knowledge and publishing brain for an independent professional.
- Explain that Rover helps capture knowledge, retrieve it later, connect it to themes, and transform it into publishable work.
- Ask whether the operator wants to continue.

#### Done When

#### Transitions

##### Transition 1

###### Event

NEXT

###### Target

identity

###### Label

Keep going

###### Description

The operator wants to continue setup.

###### Operator Description

Start identity setup.

##### Transition 2

###### Event

SKIP

###### Target

complete

###### Label

Skip

###### Description

The operator wants to skip onboarding.

###### Operator Description

Skip onboarding for now.

### State 2

#### ID

identity

#### Title

Identity setup

#### Prompt

Great. To tune Rover to you, let’s start with the basics: what name, role, audience, expertise, and tone should Rover remember for you?

#### Instructions

- Learn enough about the operator to create or update the anchor profile: name, role, audience, expertise, and desired tone.
- Ask one question at a time.
- Summarize before saving.
- Update the existing anchor profile singleton with system_update using entityType "anchor-profile" and id "anchor-profile".
- Do not use system_create for anchor-profile; anchor-profile is an existing singleton profile record.
- Explain that Rover uses identity to shape answers, site content, and publishing workflows.

#### Done When

- The anchor profile has been created or updated.

#### Transitions

##### Transition 1

###### Event

NEXT

###### Target

first-knowledge-seed

###### Label

Continue

###### Description

Identity setup is complete.

###### Operator Description

Continue to saving a first knowledge seed.

##### Transition 2

###### Event

SKIP

###### Target

first-knowledge-seed

###### Label

Skip identity

###### Description

The operator wants to skip identity setup for now.

###### Operator Description

Save identity details later and continue.

### State 3

#### ID

first-knowledge-seed

#### Title

First knowledge seed

#### Prompt

Now let’s save one useful seed. Send me a rough idea, note, link, or fragment you want Rover to remember.

#### Instructions

- Ask for one rough idea, note, link, or fragment the operator wants Rover to remember.
- Save it as the appropriate durable entity, usually a note or link.
- Use 'note' as the operator-facing term for base knowledge entries.
- Do not offer to collect another seed during onboarding; guide to the retrieval demonstration next.
- Explain that rough ideas become reusable markdown knowledge inside Rover.
- Explain how Rover can retrieve, connect, summarize, and repurpose it later.
- After saving the seed, end the turn by asking: "Want me to demonstrate retrieval next?"

#### Done When

- A first knowledge seed has been saved.

#### Transitions

##### Transition 1

###### Event

NEXT

###### Target

retrieval-demo

###### Label

Show me

###### Description

The first knowledge seed exists.

###### Operator Description

Demonstrate retrieval with the saved seed.

### State 4

#### ID

retrieval-demo

#### Title

Retrieval demonstration

#### Prompt

Want me to demonstrate retrieval by finding your saved seed now, or would you like to ask about it yourself?

#### Instructions

- Invite the operator to ask about the saved seed, or offer to demonstrate.
- Retrieve or reference the saved entity through normal agent/tool behavior.
- If the operator updates or expands the saved note, confirm the update then point back to the retrieval demonstration next.
- Explain the flywheel: more stored knowledge makes future answers and drafts more useful.
- After demonstrating retrieval, send NEXT before the final answer so the run moves to transformation.

#### Done When

#### Transitions

##### Transition 1

###### Event

NEXT

###### Target

transformation-demo

###### Label

Choose a transformation

###### Description

The retrieval demo is complete.

###### Operator Description

Continue to transformation options.

### State 5

#### ID

transformation-demo

#### Title

Transformation demonstration

#### Prompt

Next, let’s turn your raw knowledge into something useful. Would you like a blog post outline, a social draft, a newsletter idea, a topic suggestion, or a project angle?

#### Instructions

- Offer two or three transformations: blog post outline, social draft, newsletter idea, topic suggestion, or project angle.
- Create a draft entity only after the operator chooses one.
- After creating a draft, show it or offer to review it before offering wrap-up.
- Explain how Rover helps move from raw thinking to public output without leaving the brain.
- Do not publish anything unless the operator explicitly asks and confirms the publishing action.
- When the transformation demo is complete, send NEXT.

#### Done When

- A transformation draft has been created.

#### Transitions

##### Transition 1

###### Event

NEXT

###### Target

useful-next-prompts

###### Label

See useful prompts

###### Description

The transformation demo is complete.

###### Operator Description

Finish with useful next prompts.

### State 6

#### ID

useful-next-prompts

#### Title

Useful next prompts

#### Prompt

You’re set up. You can keep using Rover to save ideas, retrieve what you know, transform notes into drafts, and manage publishing work. Want a few useful prompts to try next?

#### Instructions

- Give a short list of useful next prompts.
- Remind the operator they can keep using chat to save, retrieve, transform, and manage knowledge.
- Send NEXT when the wrap-up is done.

#### Done When

#### Transitions

##### Transition 1

###### Event

NEXT

###### Target

complete

###### Label

Finish

###### Description

The wrap-up is complete.

###### Operator Description

Complete onboarding.

### State 7

#### ID

complete

#### Title

Complete

#### Prompt

Onboarding is complete. You can ask Rover to save, retrieve, transform, or publish knowledge whenever you are ready.

#### Instructions

- Mark the playbook run complete.

#### Done When

- Onboarding is complete.

#### Transitions

## Final States

- complete

## Next Prompts

- Save this idea as a note...
- Turn my latest note into a post outline.
- What topics am I circling lately?
- Draft a LinkedIn post from this essay.
- Show me what is ready to publish.
