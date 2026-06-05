# Plan: Rover Chat-Native Onboarding via Playbooks

## Status

Proposed. This plan defines first-run Rover onboarding as a lifecycle-triggered playbook that runs inside the existing anchor-only web chat surface.

This supersedes the earlier idea of a dedicated onboarding plugin with inline mission configuration. The revised direction is:

```text
playbook entity = durable editable state-machine definition
playbooks service = XState runtime, run persistence, lifecycle triggers, tools
agent context = active playbook state injected into model turns
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

The workflow itself should be deterministic enough to validate. A playbook is not just a prompt; it is a structured state-machine definition interpreted by the playbooks service with XState.

## Goals

1. Represent guided workflows as durable `playbook` entities.
2. Model playbooks as structured state-machine definitions.
3. Interpret playbook runs with XState in the `playbooks` service plugin.
4. Run Rover first-use onboarding by triggering a configured playbook in web chat.
5. Keep lifecycle/run state separate from durable playbook content.
6. Let the agent handle natural conversation while the playbook machine supplies states, allowed events, state instructions, and completion criteria.
7. Reuse existing entity tools and plugins for durable content creation/update.
8. Inject active playbook state as agent context so the model sees the current state and valid next events.
9. Keep Rover brain config minimal and declarative.
10. Make the playbook system reusable beyond onboarding.

## Non-goals

- Do not build a separate `/onboarding` wizard for MVP.
- Do not create a dedicated `onboarding` entity type.
- Do not keep onboarding states inline in `brains/rover/src/index.ts`.
- Do not make playbooks own durable content created by a workflow.
- Do not duplicate `system_create`, `system_update`, CMS, profile, note, post, or site-info responsibilities.
- Do not auto-publish content during onboarding.
- Do not make public visitor chat part of this work.
- Do not move the whole playbook system into `shell/ai-service`.
- Do not merge this with passkey setup; passkey setup remains an authentication/bootstrap concern.

## Load-bearing decisions

1. **Playbook is a state-machine entity.** It combines editable narrative guidance with machine-readable states, events, transitions, instructions, and completion criteria.
2. **XState is the runtime.** The `playbooks` service builds/interprets machines from playbook entities and validates events/transitions through XState.
3. **Onboarding is lifecycle policy.** It is not a separate plugin or entity type. It is a configured lifecycle trigger that starts/offers a playbook.
4. **Agent-led conversation, machine-enforced progress.** The agent decides wording and tool usage, but it cannot set arbitrary current states. It sends events; the machine determines whether transitions are valid.
5. **Runtime runs are operational state.** Current state, XState snapshot/value, completed states, per-run notes, and created-entity refs live in runtime storage such as `./data/playbooks`, not synced markdown content.
6. **Agent context is the AI-service boundary.** Playbooks remain a plugin capability, but active playbook state is injected through the existing agent-context provider path so the model sees state-specific guidance and valid events.
7. **Web-chat first.** MVP starts in `interfaces/web-chat`; other interfaces can use the same playbook tools/instructions later.
8. **Anchor-only.** First-run Rover onboarding requires operator permission because it can create/update private and public content.
9. **Explicit starts.** Empty chat should show a playbook invitation with a button, not auto-send a model message on page load.

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

The agent starts or resumes a playbook run, then follows the active state. It should not feel like:

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
  initialState: string;
  states: Array<{
    id: string;
    title: string;
    instructions: string[];
    completionCriteria: string[];
    expectedEntities?: Array<{
      entityType: string;
      purpose: string;
      required?: boolean;
    }>;
    transitions: Array<{
      event: string;
      target: string;
      description?: string;
    }>;
  }>;
  finalStates: string[];
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

## Initial State

welcome

## States

### welcome

Title: Welcome and orientation

Instructions:

- Explain Rover briefly as a personal knowledge and publishing brain.
- Ask whether to continue.

Completion criteria:

- Operator agrees, skips, or postpones.

Transitions:

- NEXT -> identity
- SKIP -> complete

### identity

Title: Identity setup

Instructions:

- Ask one question at a time about name, role, audience, expertise, and tone.
- Summarize before saving.
- Create or update the anchor profile with existing entity tools.

Completion criteria:

- The anchor profile is created or updated, or the operator explicitly skips this state.

Expected entities:

- anchor-profile: operator identity and positioning

Transitions:

- NEXT -> first-knowledge-seed
- SKIP -> first-knowledge-seed

### first-knowledge-seed

Title: First knowledge seed

Instructions:

- Ask for one rough idea, note, link, or fragment.
- Save it as the appropriate durable entity.
- Explain how Rover can retrieve, connect, summarize, and repurpose it later.

Completion criteria:

- A note or link is created, or an existing seed entity is identified.

Expected entities:

- base: first durable note
- link: first durable link

Transitions:

- NEXT -> retrieval-demo

## Final States

- complete

## Next Prompts

- Save this idea as a note...
- Turn my latest note into a post outline.
- What topics am I circling lately?
```

The structured formatter should support round-tripping the body. MVP can keep parsing simple and heading-based, but the entity contract should expose structured machine data to tools/tests rather than only a raw markdown string.

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
- Subscribe to agent-context requests and inject active playbook context.
- Load and parse `playbook` entities.
- Build XState machines from parsed playbook definitions.
- Validate state transitions by sending events into the XState actor/machine.
- Store playbook run state in runtime storage.
- Resolve lifecycle triggers to playbook starters.
- Provide web-chat bootstrap data for empty-chat invitations.
- Return structured playbook body data from status/start tools so the agent sees machine-readable states, rules, and valid next events.

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
  currentState: string;
  completedStates: string[];
  snapshot?: unknown; // XState-compatible persisted snapshot when practical
  context: Record<string, unknown>;
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
playbook_send_event
playbook_record_entity
playbook_complete
playbook_dismiss
playbook_reset_run
```

Tool behavior:

- `playbook_status` returns the active run, current state, valid events, playbook metadata, raw content, and parsed structured body.
- `playbook_start` creates or resumes a run for a playbook and initializes the XState machine at the playbook initial state.
- `playbook_send_event` sends a named event to the run's XState machine and persists the resulting state/snapshot. Invalid events return a tool error.
- `playbook_record_entity` links a run to an entity created/updated through normal entity tools.
- `playbook_complete` marks the run complete only when the current state is a configured final state, unless explicitly forced by an anchor-only override added later.
- `playbook_dismiss` hides or postpones a run without deleting progress.
- `playbook_reset_run` restarts a run for testing or operator-requested reruns.

## Agent context integration

Playbook execution remains in `plugins/playbooks`, but active playbook awareness should reach the agent through the existing agent-context provider mechanism.

The playbooks plugin should subscribe to the agent-context request channel and, when the conversation has an active playbook run, inject an item like:

```ts
{
  source: "active-playbook",
  title: "Rover Onboarding — state: identity",
  content: `Current state: identity
State instructions:
- Ask one question at a time about name, role, audience, expertise, and tone.

Completion criteria:
- The anchor profile is created or updated.

Valid events:
- NEXT -> first-knowledge-seed
- SKIP -> first-knowledge-seed`,
  provenance: {
    playbookId: "rover-onboarding",
    runId: "playbook_run_...",
    currentState: "identity",
    validEvents: ["NEXT", "SKIP"],
  },
}
```

This is the right `shell/ai-service` boundary for MVP: the agent package consumes active workflow context, but it does not own playbook persistence, lifecycle triggers, entity schemas, or transport UI. If playbooks become a core platform contract later, we can formalize a first-class active-workflow context type in shared contracts.

## Agent instructions

The playbooks plugin should register concise load-bearing instructions:

```text
When the operator asks to start a configured playbook or lifecycle, call playbook_start with the configured playbookId and lifecycle before continuing.
When a playbook run is active, use playbook_status before deciding what to do next.
Follow the playbook's current state instructions, operating rules, and completion criteria.
Do not set arbitrary current states. Advance by calling playbook_send_event with a valid event.
Do not behave like a form. Ask one question at a time unless the playbook state says otherwise.
Teach by doing real actions with existing tools.
After meaningful tool actions, explain what happened and why it matters.
Use existing entity tools for durable profile, site, notes, links, posts, projects, newsletters, and social drafts.
Call playbook_record_entity when a tool-created entity is important to the run.
Call playbook_complete only after the current state is a final state or the tool says completion is allowed.
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

Rover should not inline onboarding states in TypeScript config.

## Phased implementation

### Phase 1 — Playbook entity

- Add `entities/playbook` package.
- Define `playbook` schema, structured state-machine body schema, formatter, and markdown adapter.
- Use the shared structured-content formatter pattern for the playbook body.
- Support frontmatter fields needed for MVP: `title`, `status`, `audience`, `trigger`, `completionMode`.
- Parse and validate body fields needed for MVP: `purpose`, `operatingRules`, `initialState`, `states`, `finalStates`, and optional `nextPrompts`.
- Add Rover seed content for `rover-onboarding` using the structured state-machine body format.

### Phase 2 — XState runtime plugin

- Add `@brains/playbooks` service plugin.
- Add XState as a dependency where needed.
- Add JSON runtime run store.
- Build XState machine definitions from parsed playbook states/transitions.
- Add playbook tools, especially `playbook_send_event` rather than loose progress mutation.
- Add agent instructions.
- Add lifecycle starter message handler.
- Add plugin tests for valid/invalid transitions, final-state completion, run persistence, and starter availability.

### Phase 3 — Active playbook agent context

- Subscribe from `plugins/playbooks` to the agent-context request channel.
- Inject active run state, current-state instructions, completion criteria, and valid events for the current conversation.
- Keep this as plugin-provided agent context for MVP rather than moving playbook ownership into `shell/ai-service`.

### Phase 4 — Rover configuration

- Add `playbook` and `playbooks` dependencies to Rover.
- Add them to the appropriate preset(s).
- Configure onboarding lifecycle with `playbookId: "rover-onboarding"`.
- Remove any inline onboarding flow config.

### Phase 5 — Web-chat starter UI

- Add backend bootstrap/lifecycle starter call in `interfaces/web-chat`.
- Add empty-state starter card in `interfaces/web-chat/ui-react/src/App.tsx`.
- Send the starter prompt as a normal user message when clicked.
- Preserve existing empty state when no starter is available.

### Phase 6 — Evaluation and polish

- Add a targeted eval or fixture conversation for the Rover onboarding playbook.
- Verify the agent asks one question at a time, sends valid playbook events, saves a note/profile, demonstrates reuse, and completes the playbook.
- Add minimal docs or release notes after behavior is validated.

## Validation

- Run targeted tests for `entities/playbook` and `plugins/playbooks`.
- Run `bun run typecheck` for changed packages and `brains/rover`.
- Run web-chat UI build if frontend files change.
- Run Rover test app smoke check with `cd brains/rover && bun start:full` when validating the full chat flow.
- For docs-only edits to this plan, run `bun run docs:check` when links change.

## Open questions

1. Should `playbook` be a Rover-only entity at first, or a shared entity package immediately?
2. How strict should the playbook body parser be in MVP: fail on malformed state sections, or preserve raw markdown with warnings?
3. Should lifecycle starters support multiple simultaneous playbooks, or only one starter for MVP?
4. Should onboarding be enabled for all Rover presets, or only `default` and `full`?
5. Should playbook run state later move from JSON files to the proposed operator/runtime database?
6. Should we persist full XState snapshots immediately, or persist normalized state value/context first and add full snapshots only when needed?
