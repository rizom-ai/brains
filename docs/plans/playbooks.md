# Plan: Playbooks engine

## Status

The generic playbook runtime — a reusable markdown state-machine engine whose gates are
prose goals checked against the KB; nothing here is Rover-specific. First consumer is
[Rover onboarding](./rover-chat-native-onboarding.md). A first slice exists on
`feature/rover-chat-native-onboarding`; this plan is the engine half.

## Current implementation gaps

The branch currently contains useful plumbing, but it does **not** match this plan yet.
Before extending behavior, reconcile the implementation with the smaller engine shape
specified here.

Keep/reuse where compatible:

- JSON run store hardening: serialized writes, version pinning, and preservation of
  evidence/verdict arrays across stale updates.
- Runtime provenance and evidence capture from entity `created`/`updated` events.
- Conversation-scoped run inference: model-visible tools must not accept or trust
  `conversationId`; use `ToolContext.conversationId`.
- Status/start routing fixes: lifecycle/status lookup must prefer the active run in
  the current conversation, not a stale run from another conversation.
- Blocked transition hardening: a guarded `NEXT` that does not actually move the actor
  must be reported as blocked, not persisted as a successful no-op.
- Agent-context/status payload cleanup: surface current state, instructions, Done When,
  blocked/valid events, and gate reason without drowning the model in unrelated runs.

Remove or replace:

- The old typed-verdict path: `PlaybookGateVerdict`, typed `claims`,
  `evidenceWatermark`, citation validation, and `llm-judge | override |
compiled-check` sources. These belonged to the previous design and are superseded by
  `GoalCheck` returning `{ met, reason }`.
- `playbook_override_event`. This plan uses declared `SKIP` transitions or
  dismiss/edit as the escape, not a force-advance that records a false satisfied gate.
- Model-facing `playbook_complete`: reaching a final state completes the run as machine
  behavior.
- Model-facing `playbook_validate` as a runtime tool. Validation is parse-time /
  authoring-time, not a chat decision.
- Any hardcoded entity-type evaluator. Do not infer goal semantics from strings like
  “anchor profile”; if deterministic evaluation is ever needed, add the deferred
  compile/query layer generically behind `GoalCheck`.

The next implementation slice should be phase 2 below: introduce `GoalCheck`, wire a
stubbed check into gated `NEXT`, and delete the obsolete verifier/override machinery in
that same slice so the code stops carrying two gate models.

## What this is

A **playbook** is an operator-editable state machine in markdown. A **playbooks
plugin** runs it: XState runtime, run persistence, evidence collection, gates, tools,
and agent-context injection.

```text
playbook entity   = durable, editable state-machine definition (markdown)
playbooks plugin  = XState runtime, run persistence, gates, tools
agent context     = active playbook state injected into model turns
```

The agent handles wording and tool use; the machine owns which states exist and which
transitions are allowed. The agent cannot declare a state complete itself.

## How gates work

A state may declare a **Done When** goal: one or more plain-prose statements of the
outcome that must hold before the state advances — "the brain knows who the operator
is," not "the `anchor-profile` entity was updated." A gate is the **goal**, not a
mechanical entity match, so the agent can reach it any valid way and the author writes
a sentence, not a query. A state with **no** Done When is **ungated** — `NEXT` advances
freely.

On `NEXT`, a **goal check** evaluates the goal against the run's current knowledge —
the KB plus the evidence the run collected — and returns met / not-met with a short
reason. The result feeds an XState guard, so the machine stays the transition
authority; the agent can't declare the goal met itself.

The check sits behind a small interface:

```ts
interface GoalCheck {
  evaluate(input: {
    goal: string[];
    kb: KbView;
    evidence: Evidence[];
  }): Promise<{
    met: boolean;
    reason: string;
  }>;
}
```

Two implementations, and the split is the whole testing strategy:

- A **stub** (deterministic, no model) for **unit** tests — proves the machine blocks
  on not-met and advances on met, with no judgment involved.
- The **real** check, which asks the model to assess the goal against the KB/evidence.
  For a handful of gates (onboarding has two or three) it's a couple of cheap calls, not
  a hot path. Its judgment quality is covered by **evals**, never by the unit tests.

This is a scoped judge, deliberately — it's the one thing that lets a gate be a _goal_
instead of a rigid entity match. It's bounded: `NEXT`-only, behind the interface,
stub-tested for enforcement, eval-tested for judgment. No typed-claim apparatus, no
DSL, no query language — the goal is a sentence. If the check errors or is unavailable,
`NEXT` blocks and `playbook_status` reports it; a `SKIP` (where the state declares one)
is the escape.

## Playbook entity (`@brains/playbook`)

A shared package, reusable from day one. Structured markdown: frontmatter for
metadata, body parsed with the shared structured-content formatter.

```ts
interface PlaybookBody {
  purpose: string;
  operatingRules: string[];
  initialState: string;
  states: Array<{
    id: string;
    title: string;
    instructions: string[]; // teaching/guidance the agent follows (non-gating)
    doneWhen?: string[]; // prose goal(s); all must hold. omitted/empty => NEXT ungated
    transitions: Array<{ event: string; target: string; description?: string }>;
  }>;
  finalStates: string[];
  nextPrompts?: string[];
}
```

A minimal example — one ungated state, one gated:

```md
---
title: Example Playbook
status: active
---

## Purpose

What this playbook accomplishes by doing real work.

## Initial State

intro

## States

### intro

Title: Intro

Instructions:

- Explain what this is; ask whether to continue.

Transitions:

- NEXT -> setup

### setup

Title: Setup

Instructions:

- Do the work that creates the entity.

Done When:

- The thing the operator described has been captured.

Transitions:

- NEXT -> done

## Final States

- done
```

Authoring guidance: a Done When is the state's goal in plain prose — an outcome the
check can assess against the KB. If a state is pure teaching with no outcome to verify,
leave Done When empty (ungated). Editing the goal redefines the gate; a run pinned to
the old version fails loudly rather than drifting.

## Playbooks plugin (`@brains/playbooks`)

```text
plugins/playbooks/
  src/index.ts
  src/plugin.ts
  src/run-store.ts  # JSON MVP run repository
  test/
```

Responsibilities: load/parse playbook entities (fail loudly on structural errors);
build XState machines with gate guards; run tools; collect entity-event evidence for
the active run; run the goal check (goal vs. KB/evidence) on gated transitions; inject
active state into agent context; resolve lifecycle triggers and starters. It does
**not** own durable content — that's the `playbook` entity.

### Run store

Runtime state lives in a JSON store (`runs.json`) for this branch — an MVP tradeoff
given low run volume and single-process writes, not the final architecture. Make it
safe, don't replace it:

- Scope the file to runtime state, not durable content.
- Serialize writes through a store-level queue so concurrent handlers don't interleave
  read-modify-write cycles.
- Preserve evidence/verdict arrays across updates; an append must not clobber another
  queued update's state change.
- Pin each run to the playbook **version (content hash)** it started under; a transition
  against a changed definition fails loudly.

Accepted limits: no cross-process write safety; auditability by convention, not storage
shape; queries scan the file. Long-term this moves to the shell runtime-state service
([Operator runtime database](./operator-runtime-db.md)) as normalized tables; until
then, **no** plugin-private SQLite or playbook-only migration machinery.

```ts
interface PlaybookRun {
  id: string;
  playbookId: string;
  playbookVersion: string; // content hash pinned at start
  lifecycle?: string; // e.g. "onboarding"
  status: "offered" | "active" | "completed" | "dismissed";
  conversationId?: string; // at most one active run per conversation
  currentState: string;
  completedStates: string[];
  evidence: Array<{
    id: string;
    kind: "entity_event";
    stateId?: string;
    observedAt: string;
    data: Record<string, unknown>;
  }>;
  gateVerdicts: Array<{
    stateId: string;
    goal: string[];
    met: boolean;
    reason: string; // the check's short explanation (why met / what's missing)
    evaluatedAt: string;
  }>;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}
```

### Tools (anchor-only)

The agent surface is three tools:

```text
playbook_start       start or resume a run (or the lifecycle trigger starts it)
playbook_status      current state, valid/blocked events, Done When, gate result, missing evidence
playbook_send_event  send NEXT/SKIP; for NEXT, evaluate gates, then snapshot.can(NEXT)
```

Deliberately **not** tools: completion is machine behavior (reaching a final state
completes the run); dismiss/resume are UI actions on the run, not model decisions;
reset is a dev/test affordance (CLI/debug); structural validation is authoring/
parse-time. There is **no override tool**: if the check wrongly blocks, the escape is a
`SKIP` (where the state declares one) or `dismiss`/edit — not a force-advance that
records a false "met." Keeping these off the model surface is part of why the engine
stays small.

For gated `NEXT`, `playbook_send_event` runs the goal check (goal + KB + run evidence),
updates machine context with `{ met, reason }`, then relies on `snapshot.can(NEXT)`. If
the goal is not met, `NEXT` blocks and `playbook_status` reports the reason; advance by
doing the work, or `SKIP` if the state declares one.

Run-scoped tools (`playbook_send_event`, `playbook_status`) infer the run from
`ToolContext.conversationId` when `runId` is omitted, and error if no active run or
more than one active run exists for that conversation. Agent-facing playbook tool
inputs do **not** accept `conversationId`; routing/provenance is runtime context, not
model-authored content. Entity evidence is collected automatically by event
subscription; there is no `playbook_record_entity` self-reporting tool.

`playbook_validate` (and the same check at parse time) validates **structure**:
`initialState`/transition targets/`finalStates` exist, no duplicate state IDs, no
unreachable states. A `NEXT` transition is gated iff the state has a non-empty Done When
goal; an omitted/empty goal means `NEXT` is ungated. The goal itself is prose — nothing
to validate structurally.

## Agent integration

The plugin subscribes to the agent-context request channel and, when a run is active,
injects the run ID (in plain text), current state, instructions, Done When
goal, gate status / the check's reason, and valid vs blocked events — not only
in provenance metadata, so the model can see why a transition is blocked.

Registered agent instructions (concise): start the configured playbook on request;
call `playbook_status` before deciding; follow the state's instructions and rules;
advance only via `playbook_send_event` (the runtime gate check decides gated
transitions); ask one question at a time; teach by doing and explain after; if a
transition is blocked, read `playbook_status` and do the real work rather than
retrying; don't publish without explicit confirmation.

## Deferred (not built here)

The design leaves room for these; **none are in build scope.** Adding them later means
adding evidence-row kinds and (for time-based gates) a durable job — not reworking the
gate model.

- Non-entity evidence sources: tool results, confirmations, jobs, metrics, webhooks, transcript excerpts.
- Metric-over-time gates (e.g. "LinkedIn traffic +200%").
- Long-lived runs that pause and re-evaluate when async evidence arrives later.
- Run deadlines / timeouts.
- Shell-owned runtime persistence (see Run store above).
- Durable delayed jobs in `@brains/job-queue`, and any scheduler.

Playbooks stays a pure evidence _reactor_: it never schedules or polls; gate
re-evaluation is triggered by evidence arrival.

### Gate evaluation evolution (deferred)

The `GoalCheck` interface is the seam for later optimization — none of it needed now,
none of it changing callers:

- **Cache** a goal's verdict while the KB/evidence it read is unchanged, so a re-checked
  `NEXT` doesn't re-call the model.
- **Compile** hot goals to deterministic checks — translate a stable prose goal into a
  structured KB query once, then evaluate it without the model. The interface is
  unchanged; only the implementation behind it swaps.

Both are deferred until there are enough gates to warrant them. For a handful, the
model-backed check is fine.

## Phases

Migration steps over the existing `plugins/playbooks` + `entities/playbook` code. Each
is a thin slice with its own test, and the discipline is explicit: **unit tests cover
the machine with a stubbed check; evals cover the model's judgment — never both in one
phase.** The plumbing already present (run store, evidence collection, XState build,
version pin, run inference, agent-context) is reused.

1. **Ungated runs (unit).** Parse a playbook and advance `NEXT` through states with no
   Done When to a final state, reusing the existing run store / XState build. _Unit:_ a
   2-state ungated fixture reaches its final state. No gates, no model.
2. **Gate mechanism, stubbed check (unit).** Introduce the `GoalCheck` interface; a
   gated state consults it on `NEXT` and its boolean feeds the XState guard. Delete the
   old verifier / typed-claim / `evidenceWatermark` / `override` machinery here; revert
   `doneWhen` to `string[]`. _Unit:_ with a stub — met→advances, not-met→blocks,
   check-error→blocks; ungated still advances. No model. (Removes the bulk of the ~53
   judge/claims references in `plugin.ts`.)
3. **Real goal check (eval).** Implement the model-backed `GoalCheck`: goal + KB +
   evidence → `{ met, reason }`. _Eval:_ on a KB that satisfies a goal it returns met; on
   one that doesn't, not-met — asserted structurally (shape; doesn't claim met when the
   outcome is absent), not by pinning a score.
4. **Evidence into the check (unit).** Feed the run's collected entity-event evidence to
   the check alongside the KB, so a goal can reference what happened during the run.
   _Unit:_ the check receives the right evidence rows for the state.
5. **Run hardening + agent context (unit).** Verify the existing version pin, serialized
   writes, conversation-scoped inference, and agent-context injection; add the missing
   tests rather than rebuild.
6. **Confirmation stop condition (unit).** `shell/ai-service`; independent, parallelizable.

## Decisions

Load-bearing; revisit only with a documented reason.

1. **`playbook` is a shared package from the start** — reusable beyond any one
   consumer; a later promotion would churn imports.
2. **Gates are prose goals, checked against the KB** — a Done When states the outcome
   ("the brain knows who the operator is"), not an entity match, so the agent can reach
   it any valid way and the author writes a sentence, not a DSL. A scoped, model-backed
   `GoalCheck` evaluates it on `NEXT`. The judge is bounded to gate checks: `NEXT`-only,
   behind the interface, stub-tested for enforcement, eval-tested for judgment.
3. **The goal check is behind an interface** — `GoalCheck.evaluate(goal, kb, evidence)`
   returns `{ met, reason }`; the XState guard consumes that and nothing else, so the
   implementation can later be cached or compiled (see
   [Gate evaluation evolution](#gate-evaluation-evolution-deferred)) without touching
   callers.
4. **Gates are XState guards over the goal-check result** — `buildMachine` seeds the
   actor with met/not-met; the handler is a thin pass-through. The machine, not the
   handler or model instruction, is the transition authority.
5. **Confirmation is a stop condition in `shell/ai-service`** — the loop stops and
   surfaces the approval card; the requesting tool still returns its `needsConfirmation`
   payload. Not a thrown exception at the SDK boundary (which would feed back as a tool
   error).
6. **Run state stays JSON for this branch** (see [Run store](#run-store)) — long-term
   home is the shell runtime-state service. Plugins must not own private DB infra: the
   storage primitive is shell, the domain logic stays in the plugin.
7. **One active run per conversation; one lifecycle starter** — run inference depends
   on it; concurrent runs per conversation are out of scope.
