# Plan: Rover Chat-Native Onboarding via Playbooks

## Status

Implementation resumed only for reviewed backend-hardening slices on `feature/rover-chat-native-onboarding`; the branch is still not mergeable. Initial playbook/entity/runtime/web-chat work exists, and live smoke testing exposed correctness issues in the playbook/agent contract.

Hardening already landed locally after review:

- confirmation requests stop the agent turn and do not leak as generic tool results;
- `NEXT` transitions are guarded by the runtime instead of only by model instruction;
- run-scoped playbook tools infer the active conversation run when possible;
- active playbook context exposes run identity, valid/blocked events, and missing requirements;
- the Rover onboarding seed marks identity/profile work as required.

The remaining architectural pivot is larger than entity linkage: completion gates should be modeled as **human-readable Done When conditions verified against runtime evidence**. Entity create/update events are one evidence source, not the gate abstraction. Do not continue implementation or merge until the revised evidence/verifier invariants below are reviewed.

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

1. **Confirmation is terminal for an agent turn.** Once any tool returns `needsConfirmation`, the current turn must stop, expose exactly the pending approval card(s), and wait for Approve/Decline. This has landed locally, but remains a merge-blocking invariant.
2. **Confirmation is not a generic tool result.** A confirmation request must not appear in `toolResults` as a completed `Result` block. This has landed locally, but remains a merge-blocking invariant.
3. **Playbook progress is gated by verified evidence, not model assertion.** The generic abstraction is not "required entities". A playbook state declares human-readable **Done When** conditions. The runtime collects evidence while the state is active — e.g. transcript excerpts, tool results, confirmation decisions, entity mutation events, job completions, metric snapshots, webhook events — and evaluates whether the Done When conditions are satisfied. Entity create/update is only the first evidence source needed by Rover onboarding, not the gate model itself.
4. **The verifier is separate from the chat agent.** The same model turn that is trying to advance the playbook must not self-certify completion. `playbook_send_event(NEXT)` asks a runtime verifier to evaluate the current state's Done When conditions against collected evidence. The verifier may use deterministic checks for objective evidence and an LLM-as-judge/eval-style verifier for semantic conditions, but it must return a structured verdict with cited evidence and missing conditions. It must not invent evidence that was not supplied by runtime sources.

   **Merge-blocking boundary:** only the **deterministic evidence-presence verifier** is merge-blocking. Every gate the Rover onboarding seed declares is an objective "this event was observed" check (anchor-profile created/updated, note/link created), so onboarding ships on deterministic verdicts alone and never calls an LLM on the transition path. The **LLM-as-judge verifier path is designed now but deferred** — it is wired behind a verdict source that no shipping seed uses, so it is not a merge prerequisite. This keeps a working onboarding flow from being blocked on a runtime eval subsystem, while the verifier _interface_ (structured verdict, evidence citations, deterministic-first) is fixed from the start so the LLM path drops in without reshaping callers.

5. **XState remains the transition authority.** Completion verdicts are part of transition validity and must be consumed by machine guards. `NEXT` is blocked unless required Done When conditions have a satisfied verifier verdict. Explicit bypass events such as `SKIP` remain ungated where declared. The handler stays a thin pass-through; it may trigger verification before evaluating the machine, but the machine's `snapshot.can(NEXT)` must reflect the verdict.
6. **Active runs must be inferable from conversation context, uniformly across run-scoped tools.** Run-scoped playbook tools — at minimum `playbook_record_entity`, `playbook_send_event`, and `playbook_status` — infer `runId` from `ToolContext.channelId` when `runId`/`conversationId` is omitted and exactly one active run exists for that conversation, and error when more than one active run exists. This has landed locally, but remains a merge-blocking invariant.
7. **Agent context must include actionable run identity and gate state.** Active playbook context should make the current `runId`, state, valid events, blocked events, Done When conditions, verifier verdicts, and missing evidence hard to miss in the model-readable content, not only in provenance metadata. The first version of actionable context has landed locally for entity requirements; it should be reframed around Done When/verifier state before merge.
8. **Rover onboarding seed must express identity completion as a human-readable Done When gate.** The `identity` state should say, in author-readable form, that the anchor profile has been created or updated before `NEXT`; collecting only a name or saving a note is insufficient. `Done when` is the only completion field — there is no `expectedEntities`/`completionCriteria` sugar to migrate (the package ships greenfield with no legacy content; see decision 7). The seed's identity gate is a single deterministic condition: an anchor-profile create/update event observed for this state. `SKIP` remains the explicit bypass to `first-knowledge-seed`.
9. **Regression tests must be written before fixes, split by verifier determinism.** Each observed failure and each new verifier/evidence invariant gets a failing backend test before implementation changes. Because a verdict can be deterministic or LLM-judged (invariant 4), the test strategy splits: **deterministic evidence gates** (everything onboarding ships) get ordinary failing→passing backend unit tests asserting `NEXT` is blocked with the evidence absent and allowed once the evidence event is recorded — fully deterministic, no model in the loop. The **LLM-judge path** is not unit-tested for a fixed verdict (it is nondeterministic); it is exercised by eval fixtures under `@brains/ai-evaluation` and asserted structurally (verdict shape, that it cannot pass with required evidence absent), not by pinning a specific score. A gate the unit tests can't make deterministic is a signal the gate belongs to the deferred LLM path, not the merge-blocking set.
10. **Runtime evidence must be event-driven where possible, not model-reported.** `playbook_record_entity` can remain as optional annotation, but it must not be the sole source of proof. The playbooks runtime should subscribe to relevant event channels and/or receive tool/job/metric evidence from runtime services. For Rover onboarding, entity service `entity:created` / `entity:updated` events should become evidence attached to the active run. Future gates such as "LinkedIn engagement increased by 200%" should be satisfied by metric evidence supplied by the relevant plugin, not by entity writes.
11. **Reuse eval infrastructure deliberately.** Playbook gate verification is effectively a scoped runtime eval: `state + Done When rubric + evidence -> verdict`. The existing `@brains/ai-evaluation` `LLMJudge`/`PluginLLMJudge` score _conversation/output quality_ on dimensions against `AgentTestCase`/`QualityScores` schemas — they do not answer "is condition X satisfied by evidence Y." So reuse means **extracting the patterns** (the `IAIService` + structured-output-via-Zod shape, evidence citation, reasoning field), not instantiating those classes against a gate verdict. Do not embed the offline eval runner (`EvaluationService`/`run-evaluations`) in the playbooks runtime. Create a runtime-safe gate verifier interface with structured output, evidence citations, and deterministic-first behavior; the LLM-backed implementation behind it is the deferred path from invariant 4.
12. **Run state must use the shared operational-DB pattern and pin a playbook version.** The current JSON run store (`plugins/playbooks/src/run-store.ts`) is an outlier: every other operational subsystem (`@brains/job-queue`, conversation-service, entity-service) uses SQLite + drizzle + WAL, while the run store does an unlocked read-modify-write over a whole file in `upsert`, so two conversations transitioning concurrently silently lose an update (temp+rename makes each write atomic, not the read-modify-write). Playbook runs must move to the same SQLite/drizzle pattern with proper row updates. **Evidence and verdicts must be append-only child tables (`playbook_run_evidence`, `playbook_run_verdicts`), not JSON arrays on the run row.** Evidence arrives asynchronously from event subscribers (`entity:created` fires whenever the mutation happens), so appending it as `read-row → push to JSON array → write-row` is the exact lost-update race the migration is meant to kill, reintroduced. Independent `INSERT`s into a child table avoid it; the run row only carries scalar/normalized state. Separately, a run persists an XState `snapshot` but the machine is rebuilt from the playbook markdown on every transition (`plugin.ts` `transitionRun` → `buildMachine`) with no version pin, so editing a playbook mid-run drifts the snapshot from the machine and produces stuck/invalid runs. Each run must record the playbook version/content hash it started under, and a transition against a changed definition must fail loudly (or migrate deliberately), never silently.
13. **Playbooks must be validated at author/parse time, not only at runtime.** A playbook is operator-editable content, so authoring is the product surface. Referential integrity (`initialState` exists, transition targets exist, `finalStates` exist), duplicate state IDs, malformed Done When/check syntax, and verifier-ineligible gates must fail with author-facing errors. Provide a validation path (`playbook_validate` tool and/or build-time check) so an author never has to discover a broken machine through live chat.
14. **Onboarding run state must be a deliberate decision in the chat UI.** Onboarding is a stateful multi-turn flow, but the UI currently shows none of that state: the starter card appears once on empty load then vanishes, a dismissed/interrupted run has no resume affordance, and a gate-blocked transition reaches the operator only as model-paraphrased prose rather than "you are in state X; valid next: NEXT/SKIP; missing evidence: Y." This is invisible by omission, not by choice. The plan must decide explicitly what run state is surfaced — at minimum a resume affordance for an interrupted run and a structured signal when a transition is blocked — or record a conscious decision to keep it invisible and why.

Not in scope as a backend invariant:

- **Welcome repetition (observed failure 1) is not fully gate-fixable.** A verifier can decide whether "the operator agreed to continue" is satisfied from transcript evidence, but natural-language repetition can still happen if the agent ignores context. Treat this as context/instruction hardening plus a verifier-backed transition gate, not a deterministic guarantee about wording.
- **Splitting `identity` into smaller machine states is deferred.** Done When/verifier gates should fix early advancement without restructuring the machine. Revisit state-splitting only if identity still over-advances after evidence-backed gates land.

## Goals

1. Represent guided workflows as durable `playbook` entities.
2. Model playbooks as structured state-machine definitions.
3. Interpret playbook runs with XState in the `playbooks` service plugin.
4. Run Rover first-use onboarding by triggering a configured playbook in web chat.
5. Keep lifecycle/run state separate from durable playbook content.
6. Let the agent handle natural conversation while the playbook machine supplies states, allowed events, state instructions, Done When gates, and verifier feedback.
7. Reuse existing tools/plugins as runtime evidence sources, with entity create/update as the first evidence type needed by Rover onboarding.
8. Inject active playbook state as agent context so the model sees the current state, valid/blocked events, Done When conditions, and missing evidence.
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

1. **Playbook is a state-machine entity.** It combines editable narrative guidance with machine-readable states, events, transitions, instructions, and human-readable Done When conditions.
2. **XState is the runtime.** The `playbooks` service builds/interprets machines from playbook entities and validates events/transitions through XState; gate verdicts are represented as machine context used by guards.
3. **Onboarding is lifecycle policy.** It is not a separate plugin or entity type. It is a configured lifecycle trigger that starts/offers a playbook.
4. **Agent-led conversation, verifier-backed progress.** The agent decides wording and tool usage, but it cannot set arbitrary current states or self-certify state completion. It sends events; the verifier evaluates Done When conditions against runtime evidence; the machine determines whether transitions are valid.
5. **Runtime runs are operational state.** Current state, normalized machine context, completed states, evidence, verifier verdicts, per-run notes, and compatibility entity refs live in operational storage, not synced markdown content.
6. **Agent context is the AI-service boundary.** Playbooks remain a plugin capability, but active playbook state is injected through the existing agent-context provider path so the model sees state-specific guidance, valid/blocked events, and missing evidence.
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
    doneWhen: string[]; // the single completion gate: human-readable conditions evaluated against runtime evidence
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

Done when:

- The operator has agreed to continue, or explicitly chose to skip/postpone.

Transitions:

- NEXT -> identity
- SKIP -> complete

### identity

Title: Identity setup

Instructions:

- Ask one question at a time about name, role, audience, expertise, and tone.
- Summarize before saving.
- Create or update the anchor profile with existing entity tools.

Done when:

- The anchor profile has been created or updated during this state (anchor-profile create/update event observed as evidence).

Transitions:

- NEXT -> first-knowledge-seed
- SKIP -> first-knowledge-seed

### first-knowledge-seed

Title: First knowledge seed

Instructions:

- Ask for one rough idea, note, link, or fragment.
- Save it as the appropriate durable entity.
- Explain how Rover can retrieve, connect, summarize, and repurpose it later.

Done when:

- A first knowledge seed has been saved or identified as existing evidence for this run (note/link create event observed).

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
- Collect runtime evidence for active runs, starting with `entity:created` / `entity:updated` events and later extending to confirmations, jobs, metrics, webhooks, and transcript evidence (required invariant 10).
- Verify state Done When conditions against runtime evidence through a deterministic-first/runtime-safe gate verifier (required invariants 3–5 and 11).
- Load and parse `playbook` entities, rejecting malformed playbooks at parse time with errors that name the offending state/transition or malformed Done When gate (required invariant 13).
- Build XState machines from parsed playbook definitions, including completion-gate guards seeded from verifier verdicts in machine context.
- Validate state transitions by sending events into the XState actor/machine.
- Store playbook run state in the shared SQLite/drizzle operational DB pattern, pinning the playbook version/hash on each run (required invariant 12; decision 5).
- Resolve lifecycle triggers to playbook starters.
- Provide web-chat bootstrap data for empty-chat invitations.
- Return structured playbook body and gate state data from status/start tools so the agent sees machine-readable states, rules, valid/blocked events, Done When conditions, verifier verdicts, and missing evidence.

It should not own durable workflow content; that belongs to the `playbook` entity.

## Runtime state

Playbook runs are operational state, not synced markdown knowledge. Store them in the shared SQLite/drizzle operational-DB pattern used by `@brains/job-queue`, conversation-service, and entity-service — not a bespoke JSON file (required invariant 12; decision 5). This gives row-level updates instead of an unlocked whole-file read-modify-write, so concurrent transitions across conversations don't lose updates.

The `PlaybookRun` shape below is the **logical** record. Physically it is one run row of scalar/normalized columns plus two append-only child tables — `playbook_run_evidence` and `playbook_run_verdicts` — so async evidence inserts never read-modify-write the run row (required invariant 12). The `evidence[]`, `gateVerdicts[]`, and `linkedEntities[]` fields are joined/indexed views over those child rows, not JSON blobs on the run.

Run record shape:

```ts
interface PlaybookRun {
  id: string;
  playbookId: string;
  playbookVersion: string; // content hash of the playbook definition this run started under (required invariant 12)
  lifecycle?: "onboarding" | string;
  status: "offered" | "active" | "completed" | "dismissed";
  conversationId?: string; // at most one active run per conversation (decision 3)
  currentState: string;
  completedStates: string[];
  context: Record<string, unknown>; // normalized state value/context, including gate verdict state; full XState snapshots only when machine shape requires them (decision 6)
  evidence: Array<{
    id: string;
    kind: string; // e.g. entity_event, tool_result, confirmation, job, metric, transcript, override
    observedAt: string;
    stateId?: string;
    data: Record<string, unknown>;
  }>;
  gateVerdicts: Array<{
    stateId: string;
    condition: string;
    satisfied: boolean;
    source: "deterministic" | "llm-judge" | "override"; // how the verdict was reached
    evidenceIds: string[];
    reasoning?: string;
    missing?: string[];
    evaluatedAt: string;
  }>;
  linkedEntities: Array<{
    // compatibility/indexed view over entity_event evidence
    entityType: string;
    entityId: string;
    operation?: "created" | "updated";
    purpose?: string;
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

- `playbook_status` returns the active run, current state, valid events, blocked events, playbook metadata, raw content, parsed structured body, Done When conditions for the current state, verifier verdicts, and missing evidence.
- `playbook_start` creates or resumes a run for a playbook and initializes the XState machine at the playbook initial state.
- `playbook_send_event` sends a named event to the run's XState machine and persists the resulting normalized state. Invalid events return a tool error.
- `playbook_send_event` enforces completion gates through the machine, not as an ad hoc handler-side completion check. For `NEXT`, the runtime first evaluates unresolved Done When conditions against collected evidence, stores structured verifier verdicts, rebuilds/updates the machine context with those verdicts, and then relies on `snapshot.can(NEXT)` to allow or block. `SKIP` is ungated where declared. See required invariants 3–5.
- `playbook_send_event` accepts an anchor-only `override: true` that force-passes the current state's gate for one transition. It does not fake evidence: it records an explicit `kind: "override"` evidence row (who, when, reason) and a verdict marked `satisfied: true, source: "override"`, so the bypass is auditable and the machine still advances through a real (overridden) verdict rather than a side channel. This is the escape hatch for a gate stuck because a verifier is unavailable (LLM path down, eval error) or evidence cannot be produced; without it a gated `NEXT` plus a failable verifier leaves `SKIP` as the only exit.
- Evidence collection is primarily automatic: the plugin records runtime events made during an active run, starting with `entity:created` / `entity:updated`. `playbook_record_entity` is now only an optional explicit annotation (e.g. attaching a `purpose` or linking an entity the operator created earlier); it is never the sole source of proof.
- `playbook_validate` validates a playbook definition (referential integrity, duplicate state IDs, dangling transition targets, malformed Done When gates, verifier-ineligible gates) and returns structured errors naming the offending state/transition/gate — the author-facing path required by invariant 13. The same validation runs at parse time.
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
  content: `Current playbook: Rover Onboarding
Run ID: playbook_run_...
Current state: identity

State instructions:
- Ask one question at a time about name, role, audience, expertise, and tone.

Done when:
- The anchor profile has been created or updated during this state.

Verifier status:
- Missing evidence: no anchor-profile create/update event has been observed for this state.

Valid events:
- SKIP -> first-knowledge-seed

Blocked events:
- NEXT -> first-knowledge-seed`,
  provenance: {
    playbookId: "rover-onboarding",
    runId: "playbook_run_...",
    currentState: "identity",
    validEvents: ["SKIP"],
    blockedEvents: ["NEXT"],
  },
}
```

The context content must also include the exact `runId` in plain text, the valid tool calls that should use it, Done When conditions, verifier status, and missing evidence. The model should not need to infer run identity or blocked-transition causes from provenance metadata alone.

This is the right `shell/ai-service` boundary for MVP: the agent package consumes active workflow context, but it does not own playbook persistence, lifecycle triggers, entity schemas, or transport UI. If playbooks become a core platform contract later, we can formalize a first-class active-workflow context type in shared contracts.

## Agent instructions

The playbooks plugin should register concise load-bearing instructions:

```text
When the operator asks to start a configured playbook or lifecycle, call playbook_start with the configured playbookId and lifecycle before continuing.
When a playbook run is active, use playbook_status before deciding what to do next.
Follow the playbook's current state instructions, operating rules, and Done When conditions.
Do not set arbitrary current states or claim a state is complete yourself. Advance by calling playbook_send_event with a valid event; the runtime verifier decides whether gated transitions are allowed.
Do not behave like a form. Ask one question at a time unless the playbook state says otherwise.
Teach by doing real actions with existing tools.
After meaningful tool actions, explain what happened and why it matters.
Use existing tools for durable profile, site, notes, links, posts, projects, newsletters, social drafts, jobs, confirmations, and metrics. Runtime evidence from those actions is attached to the active run automatically where supported; you do not need to self-report proof.
If a transition is blocked, call playbook_status to see which Done When conditions are unsatisfied and what evidence is missing, then do the real work needed to produce that evidence rather than retrying the same event.
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
- Validate referential integrity at parse time and fail loudly with errors naming the offending state/transition/gate: `initialState` exists, every transition `target` exists, every `finalStates` entry exists, no duplicate state IDs, and Done When gates are parseable/verifier-eligible (required invariant 13; decision 2).
- Add Rover seed content for `rover-onboarding` using the structured state-machine body format.

### Phase 2 — XState runtime plugin

- Add `@brains/playbooks` service plugin.
- Add XState as a dependency where needed.
- Add the run store using the shared SQLite/drizzle operational-DB pattern, with `playbookVersion` pinned per run (required invariant 12; decisions 5–6) — not a JSON file.
- Build XState machine definitions from parsed playbook states/transitions, including completion-gate guards.
- Add playbook tools, especially `playbook_send_event` rather than loose progress mutation, plus `playbook_validate`.
- Add agent instructions.
- Add lifecycle starter message handler.
- Add plugin tests for valid/invalid transitions, final-state completion, run persistence, concurrent-transition safety, and starter availability.

### Phase 3 — Active playbook context, evidence, and gate verification

- Subscribe from `plugins/playbooks` to the agent-context request channel.
- Inject active run state, current-state instructions, Done When conditions, verifier status, valid events, blocked events, and missing evidence for the current conversation.
- Add the runtime evidence model and first evidence collectors, starting with `entity:created` / `entity:updated` events during an active run (required invariant 10). Keep `playbook_record_entity` only as an optional annotation.
- Add a runtime-safe gate verifier interface: `state + Done When + evidence -> structured verdict`. Reuse/extract `@brains/ai-evaluation` LLM-judge/criteria-evaluator patterns where appropriate, but do not embed the offline eval runner (required invariant 11).
- Keep playbook context/verifier ownership in the playbooks plugin for MVP rather than moving playbook ownership into `shell/ai-service`.

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
  - `NEXT` fails when the current state's Done When/verifier verdict is unsatisfied;
  - `SKIP` still works when declared;
  - run-scoped tools (`playbook_record_entity`, `playbook_send_event`, `playbook_status`) infer the active run from the conversation/channel context when `runId` is omitted, and error when more than one active run exists.
- Harden `buildMachine` to emit guarded transitions and seed the actor with verifier verdict state as machine context, so completion gates are enforced inside the machine (see required invariants 3–5) — not in the handler and not only in model instructions.
- Apply uniform `ToolContext.channelId` run inference across all run-scoped playbook tools, mirroring `playbook_start`.
- Express the Rover seed's `identity` completion as a single `Done when` condition requiring the anchor profile to be created/updated (anchor-profile create/update event as evidence). Remove the interim `expectedEntities`/`completionCriteria` fields from the seed and body schema entirely — there is no legacy content to stay compatible with (decision 7).
- Harden active playbook context formatting so `runId`, Done When conditions, verifier status, missing evidence, valid events, and blocked events are visible in the model-readable text (not only provenance).
- Harden `shell/ai-service` confirmation handling so confirmation outputs terminate the turn (first-class stop condition, decision 9) and are not returned as normal tool results.
- Note: welcome repetition (observed failure 1) is addressed only as context/instruction hardening; it has no deterministic gate and may retain residual model dependence.
- Re-run live Rover onboarding from a clean test-app data directory and record transcript evidence before marking this phase complete.

### Phase 8 — Structural hardening (merge prerequisites)

These follow from required invariants 10–14 and reach beyond the plugin into runtime evidence sources, eval/verifier infrastructure, storage, and web-chat UI. They are prerequisites for merge, not follow-ups.

- Implement the generic runtime evidence store for playbook runs. Add the first evidence collector from `entity:created` / `entity:updated`; enrich/propagate event context as needed so evidence can be correlated to the active conversation/run. Add failing tests first.
- Implement the runtime gate verifier interface and structured verdict persistence. Add tests showing `NEXT` is blocked by unsatisfied Done When conditions and unblocked when supplied runtime evidence satisfies them, without relying on `playbook_record_entity` self-reporting.
- Reuse/extract eval infrastructure deliberately: structured LLM judge output, deterministic criteria helpers, failure details, and evidence citations. Add tests that the verifier cannot pass a gate when required evidence is absent.
- Migrate the run store to SQLite/drizzle with a `playbookVersion` content hash per run and append-only `playbook_run_evidence` / `playbook_run_verdicts` child tables; add a concurrent-transition test proving no lost updates (including an async evidence insert landing during a transition), and a test that a transition against a changed playbook definition fails loudly (required invariant 12).
- Add `playbook_validate` plus parse-time referential-integrity/duplicate-id/Done-When validation with a build-time validation of seed playbooks (required invariant 13).
- Decide and implement chat-UI run state (required invariant 14): at minimum a resume affordance for an interrupted/dismissed run and a structured signal (not just model prose) when a transition is blocked — or record the conscious decision to keep run state invisible and why.

## Validation

- Run targeted tests for `entities/playbook` and `plugins/playbooks`, including parse-time validation and concurrent-transition safety.
- Run targeted confirmation tests for `@brains/ai-service` when touching confirmation/tool-loop behavior.
- Run targeted `@brains/entity-service` tests when enriching entity event payload/context for evidence collection (required invariant 10).
- Run `bun run typecheck` for changed packages and `brains/rover`.
- Run web-chat UI build if frontend files change.
- Run Rover test app smoke check with `cd brains/rover && bun start:full` when validating the full chat flow.
- During smoke testing, start from a fresh test app directory (clean playbooks run DB and conversation DB) so stale runs do not mask state-machine behavior.
- Verify with an actual transcript that onboarding does all of the following before completion: advances from welcome once, updates or explicitly skips anchor profile (with the update present as runtime evidence, not a model self-report), saves a first seed, demonstrates retrieval, handles transformation confirmation once, and does not emit generic `Result` blocks for pending confirmations.
- For docs-only edits to this plan, run `bun run docs:check` when links change.

## Decisions

These were open questions; all are now resolved so implementation has a single direction. Each resolution is load-bearing — revisit only with a documented reason.

1. **`playbook` is a shared entity package from the start.** Goal 10 (reusable beyond onboarding) makes a Rover-only entity a false economy; a later promotion would churn imports across packages. Ship it as a shared `@brains/playbook` package immediately, with Rover as its first consumer.
2. **The body parser fails loudly on malformed playbooks; it does not preserve raw markdown with warnings.** Silent degradation is what produces broken machines discovered in live chat (required invariant 13). Parse errors must name the offending state/transition/gate and reject duplicate state IDs, dangling transition targets, and malformed Done When gates at parse time.
3. **One active run per conversation; a single lifecycle starter for now.** Run inference (required invariant 4) and the channel→run correlation depend on "exactly one active run per conversation," so multiple simultaneous playbooks per conversation is explicitly out of scope. Supporting concurrent runs later requires re-keying inference (e.g. an explicit run selector) and is a deliberate future change, not an accident to allow now.
4. **Onboarding is enabled only on presets that expose an anchor web-chat surface (`default` and `full`).** Onboarding is anchor-only and web-chat-first (load-bearing decisions 7–8); enabling it on presets without that surface would offer a starter that cannot run.
5. **Run state uses SQLite + drizzle now, not "later."** Superseded by required invariant 12: align to the existing operational-DB pattern (`@brains/job-queue`, conversation-service, entity-service) rather than the bespoke JSON file. The JSON store is not a stepping stone to keep.
6. **Persist normalized state value + context + playbook version/hash; add full XState snapshots only when a playbook needs parallel/history states.** A normalized value plus the version pin (required invariant 12) is enough to rebuild and validate the machine for the flat state graphs MVP playbooks use, and it avoids storing an opaque snapshot that silently drifts from an edited definition. Introduce full persisted snapshots only when machine shape requires them.
7. **Completion gates are XState guards over verifier verdicts, not entity refs.** `buildMachine` derives guards from the structured body, but the guard checks normalized gate/verifier state in machine context. The durable abstraction is `Done When + runtime evidence + verifier verdict` (required invariants 3–5). There is no `expectedEntities`/`completionCriteria` compatibility layer: the package is greenfield with zero existing playbooks, so carrying sugar for a format with no past is self-inflicted legacy. `Done when` is the single completion field on a state; an entity gate is just a Done When condition whose evidence is an entity create/update event.
8. **All run-scoped tools infer the active run uniformly** from `ToolContext.channelId` (required invariant 6), not just `playbook_record_entity`.
9. **Confirmation is a first-class stop condition in `shell/ai-service`, not a tool-wrapper throw.** Required invariant 1 makes confirmation terminate the agent turn; that belongs in the tool-loop/agent-machine as an explicit stop condition that surfaces the pending approval card(s), not as an exception thrown at the SDK tool boundary (which would be caught as a tool error and fed back to the model). The confirmation-requesting tool still returns its `needsConfirmation` payload; the loop is what stops.
10. **Identity stays one state for now.** The Done When gate + clearer context + runtime evidence/verifier model should fix early advancement without restructuring the machine. Split `identity` into smaller states only if it still over-advances after evidence-backed gates land.
11. **A gated run always has an anchor escape hatch.** A gated `NEXT` plus a verifier that can fail (LLM path down, eval error) or evidence that cannot be produced must never trap a run with `SKIP` as its only exit. `playbook_send_event` takes an anchor-only `override: true` that force-passes the current gate for one transition by recording an explicit `kind: "override"` evidence row and a `source: "override"` verdict — auditable, not faked evidence. Onboarding ships on deterministic gates so this is rarely hit, but it is a deliberate resilience guarantee, not an omission.
12. **Only the deterministic verifier is merge-blocking; the LLM-judge path is built behind the interface and deferred.** Every shipping seed gate is an objective evidence-presence check, so onboarding never calls an LLM on the transition path (required invariant 4). The verifier _interface_ (structured verdict, evidence citations, deterministic-first) is fixed now; the LLM-backed implementation lands behind it without reshaping callers and is covered by eval fixtures, not deterministic unit tests (required invariant 9).
