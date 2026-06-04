# Plan: Rover Chat-Native Onboarding via Playbooks

## Status

Proposed. This plan defines first-run Rover onboarding as a lifecycle-triggered playbook that runs inside the existing anchor-only web chat surface.

This supersedes the earlier idea of a dedicated onboarding plugin with inline mission configuration. The revised direction is:

```text
playbook entity = durable editable guidance
playbooks service = runtime orchestration and progress
generic lifecycle config = when to offer/start a playbook
onboarding = one lifecycle use case, not its own workflow type
```

Related plans:

- [Brain web chat surface](./brain-web-ui.md) owns the shipped `/chat` interface.
- [Passkey Operator Onboarding](./passkey-operator-onboarding.md) owns first-passkey bootstrap and operator authentication.

## Context

Rover onboarding should teach the operator how Rover works by doing real work in chat. It is not only an intake form for profile/site fields.

The desired experience is a guided apprenticeship:

- Rover explains the knowledge + publishing brain model.
- Rover helps configure identity and site context where useful.
- Rover captures a first durable knowledge seed.
- Rover demonstrates retrieval and reuse of that knowledge.
- Rover offers a first transformation into publishable output.

This guidance should be durable and operator-editable. It should therefore live as markdown content, not as a large TypeScript config object.

## Goals

1. Represent guided workflows as durable `playbook` entities.
2. Run Rover first-use onboarding by triggering a configured playbook in web chat.
3. Keep lifecycle state separate from durable content.
4. Let the agent handle natural conversation while the playbook supplies structure, goals, constraints, and completion criteria.
5. Reuse existing entity tools and plugins for durable content creation/update.
6. Keep Rover brain config minimal and declarative.
7. Make the playbook system reusable beyond onboarding.

## Non-goals

- Do not build a separate `/onboarding` wizard for MVP.
- Do not create a dedicated `onboarding` entity type.
- Do not keep onboarding missions inline in `brains/rover/src/index.ts`.
- Do not make playbooks own durable content created by a workflow.
- Do not duplicate `system_create`, `system_update`, CMS, profile, note, post, or site-info responsibilities.
- Do not auto-publish content during onboarding.
- Do not make public visitor chat part of this work.
- Do not merge this with passkey setup; passkey setup remains an authentication/bootstrap concern.

## Load-bearing decisions

1. **Playbook is the generic hybrid entity.** It can combine narrative instructions, structured phases, teaching goals, examples, and completion criteria.
2. **Onboarding is lifecycle policy.** It is not a separate plugin or entity type. It is a configured lifecycle trigger that starts/offers a playbook.
3. **Agent-led conversation, playbook-grounded behavior.** The playbook defines what should happen; the agent decides exact wording and follow-ups.
4. **Runtime runs are operational state.** Progress, active playbook, started/completed flags, and per-run notes live in runtime storage such as `./data/playbooks`, not synced markdown content.
5. **No static script as source of truth.** Copy examples may guide the agent, but completion is based on run state and tool outcomes.
6. **Web-chat first.** MVP starts in `interfaces/web-chat`; other interfaces can use the same playbook tools/instructions later.
7. **Anchor-only.** First-run Rover onboarding requires operator permission because it can create/update private and public content.
8. **Explicit starts.** Empty chat should show a playbook invitation with a button, not auto-send a model message on page load.

## Product shape

Onboarding is the first built-in lifecycle use case for playbooks.

The operator sees an empty-chat invitation:

```text
Set up Rover
A short guided session will help Rover learn who you are, save a first idea, and show how your knowledge becomes reusable.

[Start setup]
```

Clicking the button sends a normal user message, for example:

```text
Start the Rover onboarding playbook.
```

The agent then follows the active playbook. It should not feel like:

```text
Please enter your audience.
```

It should feel like:

```text
Tell me one idea you have been circling lately. I will save it as a note, then show you how Rover can reuse it.
```

## Playbook entity

Add a generic `playbook` entity package.

A playbook is a **structured markdown entity**: frontmatter carries stable metadata, and the body is parsed with the shared structured-content formatter pattern rather than treated as opaque markdown.

Possible file location for Rover seed content:

```text
brains/rover/seed-content/playbook/rover-onboarding.md
```

Example frontmatter:

```yaml
---
title: Rover Onboarding
status: active
audience: anchor
trigger: first-anchor-web-chat
completionMode: agent-confirmed
---
```

Structured body shape:

```ts
interface PlaybookBody {
  purpose: string;
  operatingRules: string[];
  phases: Array<{
    title: string;
    setupGoal?: string;
    teachingGoal?: string;
    instructions: string[];
    completionCriteria: string[];
  }>;
  nextPrompts?: string[];
}
```

Example markdown body:

```md
## Purpose

Teach the operator how Rover works by doing useful setup work.

## Operating Rules

- Ask one question at a time.
- Teach by doing real actions.
- Save useful information with existing tools.
- Explain what Rover just did and why it matters.
- Do not publish anything unless the operator explicitly asks and confirms.

## Phases

### Welcome and orientation

Setup goal: Start the guided onboarding conversation.

Teaching goal: Explain Rover as a personal knowledge and publishing brain.

Instructions:

- Explain Rover briefly.
- Ask whether to continue.

Completion criteria:

- Operator agrees, skips, or postpones.

### First knowledge seed

Setup goal: Create the operator's first durable note or link.

Teaching goal: Show that rough ideas become reusable markdown knowledge.

Instructions:

- Ask for one rough idea, note, link, or fragment.
- Save it as the appropriate durable entity.
- Explain how Rover can retrieve, connect, summarize, and repurpose it later.

Completion criteria:

- A note or link is created, or an existing seed entity is identified.

## Next Prompts

- Save this idea as a note...
- Turn my latest note into a post outline.
- What topics am I circling lately?
```

The structured formatter should support round-tripping the body. MVP can keep parsing simple and heading-based, but the entity contract should expose structured playbook data to tools/tests rather than only a raw markdown string.

## Playbooks service plugin

Add a generic service plugin:

```text
plugins/playbooks/
  src/index.ts
  src/plugin.ts
  src/run-store.ts
  test/plugin.test.ts
```

Package name:

```text
@brains/playbooks
```

Responsibilities:

- Register playbook runtime tools.
- Register agent instructions for following active playbooks.
- Store playbook run state in runtime storage.
- Resolve lifecycle triggers to playbook starters.
- Provide web-chat bootstrap data for empty-chat invitations.
- Return structured playbook body data from status/start tools so the agent sees machine-readable phases, rules, and next prompts.

It should not own durable workflow content; that belongs to the `playbook` entity.

## Runtime state

Store playbook runs outside synced content, for example:

```text
./data/playbooks/runs.json
```

Example shape:

```ts
interface PlaybookRun {
  id: string;
  playbookId: string;
  lifecycle?: "onboarding" | string;
  status: "offered" | "active" | "completed" | "dismissed";
  conversationId?: string;
  currentPhase?: string;
  notes: Record<string, unknown>;
  createdEntities: Array<{
    entityType: string;
    entityId: string;
    purpose?: string;
  }>;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}
```

This is operational runtime state, not markdown knowledge.

## Playbook tools

Register anchor-only tools with narrow responsibilities:

```text
playbook_status
playbook_start
playbook_record_progress
playbook_record_entity
playbook_complete
playbook_dismiss
playbook_reset_run
```

Tool behavior:

- `playbook_status` returns the active run, playbook metadata, raw content, and parsed structured body.
- `playbook_start` creates or resumes a run for a playbook.
- `playbook_record_progress` stores current phase and transient notes.
- `playbook_record_entity` links a run to an entity created/updated through normal entity tools.
- `playbook_complete` marks the run complete.
- `playbook_dismiss` hides or postpones a run without deleting progress.
- `playbook_reset_run` restarts a run for testing or operator-requested reruns.

## Agent instructions

The playbooks plugin should register concise load-bearing instructions:

```text
When a playbook run is active, use playbook_status before deciding what to do next.
Follow the playbook's purpose, operating rules, phases, and completion criteria.
Do not behave like a form. Ask one question at a time unless the playbook says otherwise.
Teach by doing real actions with existing tools.
After meaningful tool actions, explain what happened and why it matters.
Use existing entity tools for durable profile, site, notes, links, posts, projects, newsletters, and social drafts.
Call playbook_record_progress as phases advance.
Call playbook_record_entity when a tool-created entity is important to the run.
Call playbook_complete only after the playbook outcome is achieved or explicitly skipped.
Do not publish content unless the operator explicitly asks and confirms the publishing action.
```

## Lifecycle config

Rover config should only map lifecycle events to playbooks.

Example:

```ts
[
  "playbooks",
  playbooksPlugin,
  {
    lifecycle: {
      onboarding: {
        trigger: "first-anchor-web-chat",
        playbookId: "rover-onboarding",
        once: true,
        starterText: "Set up Rover",
        starterPrompt: "Start the Rover onboarding playbook.",
      },
    },
  },
];
```

This keeps `brains/rover/src/index.ts` declarative and small.

## Web-chat integration

Web-chat should not know about onboarding specifically. It should ask for lifecycle playbook starters.

Possible message-bus request from `interfaces/web-chat`:

```text
playbooks:lifecycle-starters
```

Payload:

```ts
{
  lifecycle: "onboarding";
  interfaceType: "web-chat";
  userPermissionLevel: "anchor";
}
```

Response:

```ts
{
  starters: [
    {
      id: "onboarding",
      title: "Set up Rover",
      description: "Learn Rover by saving a first idea and seeing it reused.",
      starterPrompt: "Start the Rover onboarding playbook.",
    },
  ];
}
```

Frontend behavior:

- If the conversation has no messages and a lifecycle starter is available, show an assistant-style invitation in the empty state.
- The primary button sends the starter prompt as a normal user message.
- Do not auto-send on page load.
- If no starter is available, use the normal empty state.

## Rover integration

Rover should:

1. Depend on `@brains/playbooks` and the `playbook` entity package.
2. Include the `playbook` entity and `playbooks` service in the relevant presets.
3. Configure the onboarding lifecycle to use `rover-onboarding`.
4. Seed `brains/rover/seed-content/playbook/rover-onboarding.md`.

Rover should not inline onboarding phases in TypeScript config.

## Phased implementation

### Phase 1 — Playbook entity

- Add `entities/playbook` package.
- Define `playbook` schema, structured body schema, formatter, and markdown adapter.
- Use the shared structured-content formatter pattern for the playbook body.
- Support frontmatter fields needed for MVP: `title`, `status`, `audience`, `trigger`, `completionMode`.
- Parse and validate body fields needed for MVP: `purpose`, `operatingRules`, `phases`, and optional `nextPrompts`.
- Add Rover seed content for `rover-onboarding` using the structured body format.

### Phase 2 — Playbooks runtime plugin

- Add `@brains/playbooks` service plugin.
- Add JSON runtime run store.
- Add playbook tools.
- Add agent instructions.
- Add lifecycle starter message handler.
- Add plugin tests for run state transitions and starter availability.

### Phase 3 — Rover configuration

- Add `playbook` and `playbooks` dependencies to Rover.
- Add them to the appropriate preset(s).
- Configure onboarding lifecycle with `playbookId: "rover-onboarding"`.
- Remove any inline onboarding flow config.

### Phase 4 — Web-chat starter UI

- Add backend bootstrap/lifecycle starter call in `interfaces/web-chat`.
- Add empty-state starter card in `interfaces/web-chat/ui-react/src/App.tsx`.
- Send the starter prompt as a normal user message when clicked.
- Preserve existing empty state when no starter is available.

### Phase 5 — Evaluation and polish

- Add a targeted eval or fixture conversation for the Rover onboarding playbook.
- Verify the agent asks one question at a time, saves a note/profile, demonstrates reuse, and completes the playbook.
- Add minimal docs or release notes after behavior is validated.

## Validation

- Run targeted tests for `entities/playbook` and `plugins/playbooks`.
- Run `bun run typecheck` for changed packages and `brains/rover`.
- Run web-chat UI build if frontend files change.
- Run Rover test app smoke check with `cd brains/rover && bun start:full` when validating the full chat flow.
- For docs-only edits to this plan, run `bun run docs:check` when links change.

## Open questions

1. Should `playbook` be a Rover-only entity at first, or a shared entity package immediately?
2. How strict should the playbook body parser be in MVP: fail on malformed phase sections, or preserve raw markdown with warnings?
3. Should lifecycle starters support multiple simultaneous playbooks, or only one starter for MVP?
4. Should onboarding be enabled for all Rover presets, or only `default` and `full`?
5. Should playbook run state later move from JSON files to the proposed operator/runtime database?
