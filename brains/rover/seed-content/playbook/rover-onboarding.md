---
title: Rover Onboarding
status: active
audience: anchor
trigger: first-anchor-web-chat
completionMode: agent-confirmed
---

# Rover Onboarding

Purpose: teach the operator how Rover works by doing useful setup work. This is a guided apprenticeship, not a form.

## Operating rules

- Ask one question at a time.
- Teach Rover by doing real actions.
- Use existing tools to save useful information as durable entities.
- After meaningful tool actions, explain what Rover just did and why it matters.
- Do not publish anything unless the operator explicitly asks and confirms the publishing action.
- Use `playbook_record_progress` as phases advance.
- Use `playbook_record_entity` when a created or updated entity is important to this onboarding run.
- Use `playbook_complete` only after the wrap-up phase is done or the operator explicitly asks to stop onboarding.

## Phases

### 1. Welcome and orientation

Explain Rover as a personal knowledge and publishing brain for an independent professional. Rover helps capture knowledge, retrieve it later, connect it to themes, and transform it into publishable work.

Completion: the operator agrees to continue, skips, or postpones.

### 2. Identity setup

Learn enough about the operator to create or update the anchor profile: name, role, audience, expertise, and desired tone.

Ask one question at a time. Summarize before saving.

Teaching goal: explain that Rover uses identity to shape answers, site content, and publishing workflows.

Completion: the anchor profile is created or updated, or the operator explicitly skips this phase.

### 3. First knowledge seed

Ask for one rough idea, note, link, or fragment the operator wants Rover to remember.

Save it as the appropriate durable entity, usually a note or link.

Teaching goal: show that rough ideas become reusable markdown knowledge inside Rover.

Completion: a note or link is created, or an existing seed entity is identified.

### 4. Retrieval demonstration

Invite the operator to ask about the saved seed, or offer to demonstrate.

Retrieve or reference the saved entity through normal agent/tool behavior.

Teaching goal: prove that stored knowledge becomes usable context for future answers.

Completion: Rover answers using the saved seed or demonstrates that it can find or reference it.

### 5. Transformation demonstration

Offer two or three transformations, such as:

- blog post outline
- social draft
- newsletter idea
- topic suggestion
- project or case-study angle

Create a draft entity only after the operator chooses one.

Teaching goal: show how Rover helps move from raw thinking to public output without leaving the brain.

Completion: a transformation is shown in chat, or an optional draft entity is created.

### 6. Wrap-up

Give a short list of useful next prompts, such as:

- "Save this idea as a note..."
- "Turn my latest note into a post outline."
- "What topics am I circling lately?"
- "Draft a LinkedIn post from this essay."
- "Show me what is ready to publish."

Remind the operator they can keep using chat to save, retrieve, transform, and manage knowledge.

Completion: mark this playbook run complete.
