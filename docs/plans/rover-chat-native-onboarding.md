# Plan: Rover Chat-Native Onboarding via Playbooks

## Status

Implementation paused for expert review. Initial playbook/entity/runtime/web-chat work exists on `feature/rover-chat-native-onboarding`, but live smoke testing exposed correctness issues in the playbook/agent contract. Do not continue implementation or merge until the revised invariants below are reviewed.

This plan defines first-run Rover onboarding as a lifecycle-triggered playbook that runs inside the existing anchor-only web chat surface.

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

## Prototype findings requiring review

Live chat testing showed that the current MVP implementation is too permissive and relies too much on the model to follow playbook instructions. The architecture direction is still plausible, but the runtime contract needs hardening.

Observed failures:

1. **Welcome repetition.** The operator says “yes”, but Rover repeats the welcome/orientation prompt instead of reliably advancing or rechecking current state.
2. **Identity advances too early.** Rover can move from `identity` to `first-knowledge-seed` after partial data such as only a name/role, without creating or updating the anchor profile.
3. **Wrong entity use in identity.** Rover saved a byline/name as a generic note instead of updating the protected anchor profile.
4. **Run identity is brittle.** Rover reported that it could not attach `playbook_record_entity` because the run ID was unavailable, despite an active playbook being tied to the web-chat conversation.
5. **Confirmation requests leak as results.** A `needsConfirmation` tool output can be exposed as a normal tool result, causing visible `Result { toolName: "system_update", ... }` blocks for an action that has not executed yet.
6. **Confirmation requests are not terminal enough.** The agent/tool loop can keep producing “Confirmation required” after one pending approval; confirmation should stop the turn and wait for the operator.
7. **State machine only validates transition shape.** XState confirms that `NEXT` is allowed, but does not by itself prove state completion criteria are satisfied.

Required backend invariants before this plan is mergeable:

1. **Confirmation is terminal for an agent turn.** Once any tool returns `needsConfirmation`, the current turn must stop, expose exactly the pending approval card(s), and wait for Approve/Decline. Today the tool loop stops only on `stepCountIs(stepLimit)` (`shell/ai-service/src/brain-agent.ts`); confirmation is detected post-hoc and merely rewrites the response text (`shell/ai-service/src/agent-service.ts`), so side-effecting tools in later steps can still execute after the model has flagged an action for approval.
2. **Confirmation is not a generic tool result.** A confirmation request must not appear in `toolResults` as a completed `Result` block. Today `shell/ai-service/src/agent-results.ts` still pushes a minimal `{ toolName, args }` entry into `toolResults` for a `needsConfirmation` output even though the same confirmation is already carried by the `tool-approval` card and `pendingConfirmations`; drop that push.
3. **Playbook transitions need completion gates, enforced in the machine.** `playbook_send_event` must not allow `NEXT` out of a state with required expected entities unless those entities have been recorded or the event is an explicit bypass such as `SKIP`.
   - **The gate is an XState guard, not a handler check.** Load-bearing decisions 2 and 4 make XState the runtime and "the machine determines whether transitions are valid." Completion gates are part of transition validity, so they belong in the machine as `guard`s on the transitions — not as an `if` in the `playbook_send_event` handler that runs before/around `snapshot.can()`. A handler-side check would split the definition of "is this transition valid" across two places and erode the machine as the single source of truth; the next interface or trigger that sends events without going through that handler would silently bypass the gate. `buildMachine` must therefore seed the actor with the run's recorded entities as machine context/input, and emit guarded transitions (e.g. `NEXT` guarded by "all `required` expected entities for this state are present in context", `SKIP` ungated where declared). `snapshot.can(NEXT)` then returns false on its own when the gate is unmet, and the handler stays a thin pass-through. This is the architecture for all playbooks, not a special case for onboarding.
4. **Active runs must be inferable from conversation context, uniformly across run-scoped tools.** Run-scoped playbook tools — at minimum `playbook_record_entity`, `playbook_send_event`, and `playbook_status` — should infer `runId` from `ToolContext.channelId` when `runId`/`conversationId` is omitted and exactly one active run exists for that conversation, and error when more than one active run exists. The model's confusion comes from some tools needing an explicit `runId` while others do not; making inference uniform removes the failure mode entirely. This is low-risk: `playbook_start` already does `parsed.conversationId ?? toolContext.channelId` and the run store already exposes `findActiveByConversation`, so the fix is propagating an existing pattern. (This is the answer to open question 8: yes, all run-scoped tools, not just `playbook_record_entity`.)
5. **Agent context must include actionable run identity.** Active playbook context should make the current `runId`, state, valid events, and required expected entities (and which required ones are not yet recorded) hard to miss in the model-readable content, not only in provenance metadata.
6. **Rover onboarding seed must model identity as a gated state.** The `identity` state should require an `anchor-profile` record/update before `NEXT`; collecting only a name or saving a note is insufficient. This requires flipping the seed's `anchor-profile` expected entity to `required: true` so the machine guard in invariant 3 actually fires; `SKIP` remains the explicit bypass to `first-knowledge-seed`.
7. **Regression tests must be written before fixes.** Each observed failure should have a failing backend test before implementation changes.
8. **Entity linkage must be event-driven, not model-reported.** The completion gate (invariants 3 and 6) is only as trustworthy as `run.createdEntities`, which today is populated solely when the model calls `playbook_record_entity` — a gate meant to stop trusting the model is itself gated on the model self-reporting. The entity service already emits `entity:created` / `entity:updated` on the message bus (`shell/entity-service/src/entity-mutations.ts`). The playbooks plugin must subscribe to those events and auto-link writes made during an active run to that run, so the gate observes real entity mutations rather than a model claim. `playbook_record_entity` remains only as an optional explicit annotation (e.g. attaching a `purpose`), never as the sole source of linkage. To let a guard assert "the `anchor-profile` was actually updated" rather than "some entity appeared," the entity event payload must be enriched beyond `{ entityType, entityId }` to include the operation (`created` | `updated`). This is the change that makes invariants 3, 4, and 6 correct instead of fragile.
9. **Run state must use the shared operational-DB pattern and pin a playbook version.** The current JSON run store (`plugins/playbooks/src/run-store.ts`) is an outlier: every other operational subsystem (`@brains/job-queue`, conversation-service, entity-service) uses SQLite + drizzle + WAL, while the run store does an unlocked read-modify-write over a whole file in `upsert`, so two conversations transitioning concurrently silently lose an update (temp+rename makes each write atomic, not the read-modify-write). Playbook runs must move to the same SQLite/drizzle pattern with proper row updates. Separately, a run persists an XState `snapshot` but the machine is rebuilt from the playbook markdown on every transition (`plugin.ts` `transitionRun` → `buildMachine`) with no version pin, so editing a playbook mid-run drifts the snapshot from the machine and produces stuck/invalid runs. Each run must record the playbook version/content hash it started under, and a transition against a changed definition must fail loudly (or migrate deliberately), never silently.
10. **Playbooks must be validated at author/parse time, not only at runtime.** A playbook is operator-editable content, so authoring is the product surface. Today referential integrity (`initialState` exists, transition targets exist, `finalStates` exist) is checked only at `playbook_start` runtime, duplicate state IDs are not checked at all (`Object.fromEntries` silently overwrites in `buildMachine`), and a parse failure throws a bare `"Failed to parse structured content"` with no location. The playbook entity parser/formatter must validate referential integrity and reject duplicate state IDs at parse time, with errors that name the offending state/transition. Provide an author-facing validation path (a `playbook_validate` tool and/or a build-time check) so an author never has to discover a broken machine through live chat.
11. **Onboarding run state must be a deliberate decision in the chat UI.** Onboarding is a stateful multi-turn flow, but the UI currently shows none of that state: the starter card appears once on empty load then vanishes, a dismissed/interrupted run has no resume affordance, and a gate-blocked transition reaches the operator only as model-paraphrased prose rather than "you are in state X; valid next: NEXT/SKIP." This is invisible by omission, not by choice. The plan must decide explicitly what run state is surfaced — at minimum a resume affordance for an interrupted run and a structured signal when a transition is blocked — or record a conscious decision to keep it invisible and why.

Not in scope as a backend invariant:

- **Welcome repetition (observed failure 1) is not gate-fixable.** The `welcome` state has no required expected entities, so a completion gate cannot prevent Rover from re-prompting the orientation message. It is mitigated, not eliminated, by invariant 5 (current state and `runId` impossible to miss in context) plus the existing instruction to call `playbook_status` before deciding what to do next. Treat this as context/instruction hardening with residual model dependence, not a deterministic backend fix.
- **Splitting `identity` into smaller machine states (open question 10) is deferred.** The completion gate (invariant 3), `required: true` (invariant 6), and clearer agent context (invariant 5) should fix early advancement without restructuring the machine. Revisit state-splitting only if identity still over-advances after this hardening lands.

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
  src/db/            # drizzle schema + run repository (SQLite, see decision 5)
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
- Subscribe to `entity:created` / `entity:updated` events and auto-link entity writes made during an active run to that run (required invariant 8), so the completion gate observes real mutations rather than model self-reports.
- Load and parse `playbook` entities, rejecting malformed playbooks at parse time with errors that name the offending state/transition (required invariant 10).
- Build XState machines from parsed playbook definitions, including completion-gate guards seeded from the run's linked entities.
- Validate state transitions by sending events into the XState actor/machine.
- Store playbook run state in the shared SQLite/drizzle operational DB pattern, pinning the playbook version/hash on each run (required invariant 9; decision 5).
- Resolve lifecycle triggers to playbook starters.
- Provide web-chat bootstrap data for empty-chat invitations.
- Return structured playbook body data from status/start tools so the agent sees machine-readable states, rules, and valid next events.

It should not own durable workflow content; that belongs to the `playbook` entity.

## Runtime state

Playbook runs are operational state, not synced markdown knowledge. Store them in the shared SQLite/drizzle operational-DB pattern used by `@brains/job-queue`, conversation-service, and entity-service — not a bespoke JSON file (required invariant 9; decision 5). This gives row-level updates instead of an unlocked whole-file read-modify-write, so concurrent transitions across conversations don't lose updates.

Run record shape:

```ts
interface PlaybookRun {
  id: string;
  playbookId: string;
  playbookVersion: string; // content hash of the playbook definition this run started under (required invariant 9)
  lifecycle?: "onboarding" | string;
  status: "offered" | "active" | "completed" | "dismissed";
  conversationId?: string; // at most one active run per conversation (decision 3)
  currentState: string;
  completedStates: string[];
  context: Record<string, unknown>; // normalized state value/context; full XState snapshots only when machine shape requires them (decision 6)
  linkedEntities: Array<{
    entityType: string;
    entityId: string;
    operation: "created" | "updated"; // captured from entity events (required invariant 8)
    purpose?: string; // optional annotation via playbook_record_entity
  }>;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}
```

A transition against a playbook whose content hash no longer matches `playbookVersion` must fail loudly (or be migrated deliberately), never silently drift.

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
playbook_validate
```

Tool behavior:

- `playbook_status` returns the active run, current state, valid events, playbook metadata, raw content, parsed structured body, required expected entities for the current state, and linked entity refs (with which required ones are still missing).
- `playbook_start` creates or resumes a run for a playbook and initializes the XState machine at the playbook initial state.
- `playbook_send_event` sends a named event to the run's XState machine and persists the resulting normalized state. Invalid events return a tool error.
- `playbook_send_event` enforces completion gates through the machine, not in the handler. The machine is built with guarded transitions and seeded with the run's linked entities, so `snapshot.can(NEXT)` already returns false when a state's `required` expected entities are missing; the handler just sends the event and surfaces the resulting invalid-event error. `SKIP` is ungated where declared. See required invariant 3.
- Entity linkage is primarily automatic: the plugin's `entity:created` / `entity:updated` subscriber links writes made during an active run (required invariant 8). `playbook_record_entity` is now only an optional explicit annotation (e.g. attaching a `purpose` or linking an entity the operator created earlier); it is never the sole source of linkage.
- `playbook_validate` validates a playbook definition (referential integrity, duplicate state IDs, dangling transition targets) and returns structured errors naming the offending state/transition — the author-facing path required by invariant 10. The same validation runs at parse time.
- Run-scoped tools (`playbook_record_entity`, `playbook_send_event`, `playbook_status`) resolve the run uniformly: when `runId`/`conversationId` is omitted, infer the active run from `ToolContext.channelId` via `findActiveByConversation`, and error if more than one active run exists for that conversation. This matches what `playbook_start` already does and removes the "some tools need an explicit `runId`, others don't" failure mode.
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

The context content must also include the exact `runId` in plain text, the valid tool calls that should use it, and any required expected entities not yet recorded. The model should not need to infer run identity from provenance metadata alone.

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
Use existing entity tools for durable profile, site, notes, links, posts, projects, newsletters, and social drafts. Entities you create or update during a run are linked to it automatically; you do not need to report them.
If a transition is blocked, call playbook_status to see which required entities are still missing, then create or update them with existing entity tools rather than retrying the same event.
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

- Add a shared `entities/playbook` package (`@brains/playbook`), not a Rover-only entity (decision 1).
- Define `playbook` schema, structured state-machine body schema, formatter, and markdown adapter.
- Use the shared structured-content formatter pattern for the playbook body.
- Support frontmatter fields needed for MVP: `title`, `status`, `audience`, `trigger`, `completionMode`.
- Parse and validate body fields needed for MVP: `purpose`, `operatingRules`, `initialState`, `states`, `finalStates`, and optional `nextPrompts`.
- Validate referential integrity at parse time and fail loudly with errors naming the offending state/transition: `initialState` exists, every transition `target` exists, every `finalStates` entry exists, and no duplicate state IDs (required invariant 10; decision 2).
- Add Rover seed content for `rover-onboarding` using the structured state-machine body format.

### Phase 2 — XState runtime plugin

- Add `@brains/playbooks` service plugin.
- Add XState as a dependency where needed.
- Add the run store using the shared SQLite/drizzle operational-DB pattern, with `playbookVersion` pinned per run (required invariant 9; decisions 5–6) — not a JSON file.
- Build XState machine definitions from parsed playbook states/transitions, including completion-gate guards.
- Add playbook tools, especially `playbook_send_event` rather than loose progress mutation, plus `playbook_validate`.
- Add agent instructions.
- Add lifecycle starter message handler.
- Add plugin tests for valid/invalid transitions, final-state completion, run persistence, concurrent-transition safety, and starter availability.

### Phase 3 — Active playbook agent context and entity linkage

- Subscribe from `plugins/playbooks` to the agent-context request channel.
- Inject active run state, current-state instructions, completion criteria, and valid events for the current conversation.
- Subscribe to `entity:created` / `entity:updated` and auto-link entity writes during an active run to that run (required invariant 8); keep `playbook_record_entity` only as an optional annotation.
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

### Phase 7 — Runtime hardening before merge

This phase is now required based on live smoke-test failures.

- Add failing backend regressions for confirmation terminality:
  - a `needsConfirmation` result stops the AI/tool loop for the turn;
  - confirmation requests do not appear as generic `toolResults`;
  - repeated confirmation attempts after a pending approval are ignored by result extraction.
- Add failing playbooks plugin regressions for transition gating and run inference:
  - `NEXT` fails when the current state has missing required expected entities;
  - `SKIP` still works when declared;
  - run-scoped tools (`playbook_record_entity`, `playbook_send_event`, `playbook_status`) infer the active run from the conversation/channel context when `runId` is omitted, and error when more than one active run exists.
- Harden `buildMachine` to emit guarded transitions and seed the actor with the run's linked entities as machine context/input, so completion gates are enforced inside the machine (see required invariant 3) — not in the handler and not only in model instructions.
- Apply uniform `ToolContext.channelId` run inference across all run-scoped playbook tools, mirroring `playbook_start`.
- Flip the Rover seed's `identity` `anchor-profile` expected entity to `required: true` so the gate fires; keep `SKIP` as the explicit bypass.
- Harden active playbook context formatting so `runId`, missing required entities, and valid next events are visible in the model-readable text (not only provenance).
- Harden `shell/ai-service` confirmation handling so confirmation outputs terminate the turn (first-class stop condition, decision 9) and are not returned as normal tool results.
- Note: welcome repetition (observed failure 1) is addressed only as context/instruction hardening; it has no deterministic gate and may retain residual model dependence.
- Re-run live Rover onboarding from a clean test-app data directory and record transcript evidence before marking this phase complete.

### Phase 8 — Structural hardening (merge prerequisites)

These follow from required invariants 8–11 and reach beyond the plugin into the entity service and web-chat UI. They are prerequisites for merge, not follow-ups.

- Enrich `entity:created` / `entity:updated` event payloads with the operation (`created` | `updated`) so a guard can assert "the `anchor-profile` was actually updated," not merely "an entity appeared" (required invariant 8). Add failing entity-service tests first.
- Implement the playbooks `entity:*` subscriber and run auto-linkage; add a test that a `system_update` to the anchor profile during an active `identity` run unblocks `NEXT` without any `playbook_record_entity` call.
- Migrate the run store to SQLite/drizzle with a `playbookVersion` content hash per run; add a concurrent-transition test proving no lost updates, and a test that a transition against a changed playbook definition fails loudly (required invariant 9).
- Add `playbook_validate` plus parse-time referential-integrity/duplicate-id checks with a build-time validation of seed playbooks (required invariant 10).
- Decide and implement chat-UI run state (required invariant 11): at minimum a resume affordance for an interrupted/dismissed run and a structured signal (not just model prose) when a transition is blocked — or record the conscious decision to keep run state invisible and why.

## Validation

- Run targeted tests for `entities/playbook` and `plugins/playbooks`, including parse-time validation and concurrent-transition safety.
- Run targeted confirmation tests for `@brains/ai-service` when touching confirmation/tool-loop behavior.
- Run targeted `@brains/entity-service` tests when enriching entity event payloads (required invariant 8).
- Run `bun run typecheck` for changed packages and `brains/rover`.
- Run web-chat UI build if frontend files change.
- Run Rover test app smoke check with `cd brains/rover && bun start:full` when validating the full chat flow.
- During smoke testing, start from a fresh test app directory (clean playbooks run DB and conversation DB) so stale runs do not mask state-machine behavior.
- Verify with an actual transcript that onboarding does all of the following before completion: advances from welcome once, updates or explicitly skips anchor profile (with the update auto-linked from the entity event, not a model self-report), saves a first seed, demonstrates retrieval, handles transformation confirmation once, and does not emit generic `Result` blocks for pending confirmations.
- For docs-only edits to this plan, run `bun run docs:check` when links change.

## Decisions

These were open questions; all are now resolved so implementation has a single direction. Each resolution is load-bearing — revisit only with a documented reason.

1. **`playbook` is a shared entity package from the start.** Goal 10 (reusable beyond onboarding) makes a Rover-only entity a false economy; a later promotion would churn imports across packages. Ship it as a shared `@brains/playbook` package immediately, with Rover as its first consumer.
2. **The body parser fails loudly on malformed playbooks; it does not preserve raw markdown with warnings.** Silent degradation is what produces broken machines discovered in live chat (required invariant 10). Parse errors must name the offending state/transition and reject duplicate state IDs and dangling transition targets at parse time.
3. **One active run per conversation; a single lifecycle starter for now.** Run inference (required invariant 4) and the channel→run correlation depend on "exactly one active run per conversation," so multiple simultaneous playbooks per conversation is explicitly out of scope. Supporting concurrent runs later requires re-keying inference (e.g. an explicit run selector) and is a deliberate future change, not an accident to allow now.
4. **Onboarding is enabled only on presets that expose an anchor web-chat surface (`default` and `full`).** Onboarding is anchor-only and web-chat-first (load-bearing decisions 7–8); enabling it on presets without that surface would offer a starter that cannot run.
5. **Run state uses SQLite + drizzle now, not "later."** Superseded by required invariant 9: align to the existing operational-DB pattern (`@brains/job-queue`, conversation-service, entity-service) rather than the bespoke JSON file. The JSON store is not a stepping stone to keep.
6. **Persist normalized state value + context + playbook version/hash; add full XState snapshots only when a playbook needs parallel/history states.** A normalized value plus the version pin (required invariant 9) is enough to rebuild and validate the machine for the flat state graphs MVP playbooks use, and it avoids storing an opaque snapshot that silently drifts from an edited definition. Introduce full persisted snapshots only when machine shape requires them.
7. **Completion gates are XState guards, derived by `buildMachine` from the structured body.** Gates are seeded from the run's linked entities so the machine stays the single source of truth for transition validity (required invariant 3). Guard conditions are derived from `expectedEntities.required` for now; add declarative guard rules in the body only if a playbook needs conditions richer than "required entities present."
8. **All run-scoped tools infer the active run uniformly** from `ToolContext.channelId` (required invariant 4), not just `playbook_record_entity`.
9. **Confirmation is a first-class stop condition in `shell/ai-service`, not a tool-wrapper throw.** Required invariant 1 makes confirmation terminate the agent turn; that belongs in the tool-loop/agent-machine as an explicit stop condition that surfaces the pending approval card(s), not as an exception thrown at the SDK tool boundary (which would be caught as a tool error and fed back to the model). The confirmation-requesting tool still returns its `needsConfirmation` payload; the loop is what stops.
10. **Identity stays one state for now.** The gate (invariant 3) + `required: true` (invariant 6) + clearer context (invariant 5) + event-driven linkage (invariant 8) should fix early advancement without restructuring the machine. Split `identity` into smaller states only if it still over-advances after this hardening lands.
