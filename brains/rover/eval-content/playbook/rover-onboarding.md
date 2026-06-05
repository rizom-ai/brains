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
- Use playbook_send_event to advance states only after completion criteria are met.
- Use playbook_record_entity when a created or updated entity is important to this onboarding run.
- Use playbook_complete only after the run reaches a final state.

## Initial State

welcome

## States

### State 1

#### ID

welcome

#### Title

Welcome and orientation

#### Instructions

- Explain Rover as a personal knowledge and publishing brain for an independent professional.
- Explain that Rover helps capture knowledge, retrieve it later, connect it to themes, and transform it into publishable work.
- Ask whether the operator wants to continue.

#### Completion Criteria

- The operator agrees to continue, skips, or postpones.

#### Expected Entity Refs

#### Transitions

##### Transition 1

###### Event

NEXT

###### Target

identity

###### Description

The operator wants to continue setup.

##### Transition 2

###### Event

SKIP

###### Target

complete

###### Description

The operator wants to skip onboarding.

### State 2

#### ID

identity

#### Title

Identity setup

#### Instructions

- Learn enough about the operator to create or update the anchor profile: name, role, audience, expertise, and desired tone.
- Ask one question at a time.
- Summarize before saving.
- Create or update the anchor profile with existing entity tools.
- Explain that Rover uses identity to shape answers, site content, and publishing workflows.

#### Completion Criteria

- The anchor profile is created or updated, or the operator explicitly skips this state.

#### Expected Entity Refs

##### Expected Entity Ref 1

###### Entity Type

anchor-profile

###### Purpose

operator identity and positioning

###### Required

false

#### Transitions

##### Transition 1

###### Event

NEXT

###### Target

first-knowledge-seed

###### Description

Identity setup is complete.

##### Transition 2

###### Event

SKIP

###### Target

first-knowledge-seed

###### Description

The operator wants to skip identity setup for now.

### State 3

#### ID

first-knowledge-seed

#### Title

First knowledge seed

#### Instructions

- Ask for one rough idea, note, link, or fragment the operator wants Rover to remember.
- Save it as the appropriate durable entity, usually a note or link.
- Explain that rough ideas become reusable markdown knowledge inside Rover.
- Explain how Rover can retrieve, connect, summarize, and repurpose it later.

#### Completion Criteria

- A note or link is created, or an existing seed entity is identified.

#### Expected Entity Refs

##### Expected Entity Ref 1

###### Entity Type

base

###### Purpose

first durable note

###### Required

false

##### Expected Entity Ref 2

###### Entity Type

link

###### Purpose

first durable link

###### Required

false

#### Transitions

##### Transition 1

###### Event

NEXT

###### Target

retrieval-demo

###### Description

The first knowledge seed exists.

### State 4

#### ID

retrieval-demo

#### Title

Retrieval demonstration

#### Instructions

- Invite the operator to ask about the saved seed, or offer to demonstrate.
- Retrieve or reference the saved entity through normal agent/tool behavior.
- Explain the flywheel: more stored knowledge makes future answers and drafts more useful.

#### Completion Criteria

- Rover answers using the saved seed or demonstrates that it can find or reference it.

#### Expected Entity Refs

#### Transitions

##### Transition 1

###### Event

NEXT

###### Target

transformation-demo

###### Description

The retrieval demo is complete.

### State 5

#### ID

transformation-demo

#### Title

Transformation demonstration

#### Instructions

- Offer two or three transformations: blog post outline, social draft, newsletter idea, topic suggestion, or project angle.
- Create a draft entity only after the operator chooses one.
- Explain how Rover helps move from raw thinking to public output without leaving the brain.
- Do not publish anything unless the operator explicitly asks and confirms the publishing action.

#### Completion Criteria

- A transformation is shown in chat, or an optional draft entity is created.

#### Expected Entity Refs

#### Transitions

##### Transition 1

###### Event

NEXT

###### Target

wrap-up

###### Description

The transformation demo is complete.

### State 6

#### ID

wrap-up

#### Title

Wrap up

#### Instructions

- Give a short list of useful next prompts.
- Remind the operator they can keep using chat to save, retrieve, transform, and manage knowledge.
- Send NEXT when the wrap-up is done.

#### Completion Criteria

- The operator has received next prompts and understands how to continue.

#### Expected Entity Refs

#### Transitions

##### Transition 1

###### Event

NEXT

###### Target

complete

###### Description

The wrap-up is complete.

### State 7

#### ID

complete

#### Title

Complete

#### Instructions

- Mark the playbook run complete.

#### Completion Criteria

- Onboarding is complete.

#### Expected Entity Refs

#### Transitions

## Final States

- complete

## Next Prompts

- Save this idea as a note...
- Turn my latest note into a post outline.
- What topics am I circling lately?
- Draft a LinkedIn post from this essay.
- Show me what is ready to publish.
