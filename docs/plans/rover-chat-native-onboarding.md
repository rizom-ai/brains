# Plan: Rover Chat-Native Onboarding via Playbooks

## Status

On `feature/rover-chat-native-onboarding`; not yet mergeable. A first
playbook/entity/runtime/web-chat slice exists, and live smoke testing exposed
correctness gaps (below). This plan is scoped to **shipping Rover onboarding** —
not the general playbook platform. Anything an onboarding run does not exercise
is listed under [Deferred](#deferred-not-built-here) and is explicitly out of
build scope.

Related: [Brain web chat surface](./brain-web-ui.md) owns `/chat`;
[Passkey Operator Onboarding](./passkey-operator-onboarding.md) owns first-passkey
bootstrap.

## What this is

First-run Rover onboarding is a lifecycle-triggered **playbook** that runs inside
the existing anchor-only web chat. It teaches the operator by doing real work —
set up identity, save a first knowledge seed, show it being reused — not by being
an intake form.

```text
playbook entity   = durable, operator-editable state-machine definition (markdown)
playbooks plugin  = XState runtime, run persistence, lifecycle triggers, tools
agent context     = active playbook state injected into model turns
onboarding        = one lifecycle use case, not its own workflow type
```

The agent handles wording and tool use; the machine owns which states exist and
which transitions are allowed. The agent cannot declare a state complete itself.

## Failures this fixes

From live testing of the first slice:

1. **Welcome repetition** — operator says "yes" but Rover re-prompts instead of advancing.
2. **Identity advances too early** — moves on after a bare name, without writing the profile.
3. **Wrong entity in identity** — saves a byline as a note instead of updating the anchor profile.
4. **Brittle run identity** — a tool can't find its run even though one is active on the conversation.
5. **Confirmation leaks as a result** — a `needsConfirmation` output shows as a completed `Result` block.
6. **Confirmation isn't terminal** — the loop keeps going after a pending approval.
7. **Machine only checks transition shape** — XState allows `NEXT` without proving the state's work was done.

## How gates work (the core decision)

A state may declare **Done When** conditions. A Done When is **plain prose** — a
sentence the author writes and reads. No IDs, no tags, no query syntax.

On `NEXT`, the runtime asks an **LLM judge** (a separate call, not the chat turn)
to read those sentences against the **evidence the run has collected** and return
a structured verdict: per-condition `satisfied`, cited evidence IDs, typed claims
about those evidence rows, and a plain-language "what's missing." The verdict feeds
an XState guard, so the machine stays the transition authority. `SKIP`, where
declared, is ungated.

Two guards make this safe:

- **A `satisfied` verdict must cite real evidence, and its typed claims must match
  the cited rows.** The judge asserts, per citation, what the row _is_ (e.g.
  `{ kind: entity_event, data: { entityType: anchor-profile, operation: updated } }`),
  and the runtime rejects any `satisfied: true` that cites no evidence, cites an ID
  not in the run's evidence table, or makes a claim the cited row does not support
  (it claims `anchor-profile` but the row is a `note`). Such verdicts are recorded as
  unsatisfied. This validates the claim against the **row**, not against the prose —
  so it closes two of the three false-positive forms: fabrication, and
  citation-inconsistency (the judge mislabeling what it cited). It does **not** close
  the third: the judge citing an irrelevant row and labeling it _honestly_ (cites the
  note, claims `note`, still marks the profile gate done) — the runtime can't know a
  note is irrelevant to "anchor profile created" because it never parsed the prose.
  That residual is the irreducible cost of pure-prose gates; it is closed only by the
  deferred compiler (which binds a gate to an expected type) or the strict
  observable-gate stance — see [Verifier evolution](#verifier-evolution-deferred). In
  practice it requires a blunter judge error (deeming an obviously-irrelevant row
  sufficient) than the citation-inconsistency it does catch.
- **An anchor override exists for the other direction.** If the judge is
  unavailable or stuck-unsure, a gated run must not trap the operator with `SKIP`
  as the only exit. `playbook_override_event` (anchor-only, confirmation-required,
  needs a reason) records an auditable `override` verdict.

This puts an LLM call on every gated `NEXT` — accepted deliberately: prose gates
need something that reads prose, and that generality is the point. Cost is bounded
(only `NEXT` is gated, once per transition, verdicts cached for unchanged
evidence), and the gate-_enforcement_ logic is unit-tested around a stubbed
verdict, so only judgment quality depends on the model.

**For onboarding there is exactly one evidence source: entity `created`/`updated`
events.** Both shipping gates ("the anchor profile was created or updated", "a
first knowledge seed was saved") are satisfied by such an event during the state.
The evidence model is just a list of rows, so other sources can be added later
without reshaping anything — see Deferred.

**Two contracts are fixed now so the verifier can evolve later without a rewrite**
(see [Verifier evolution](#verifier-evolution-deferred)):

- **Evidence is stored as structured, typed rows, never opaque text.** An entity
  event is `{ kind: "entity_event", entityType, operation, stateId, … }` — queryable
  by field. A live judge could limp along on prose-ified evidence; a future
  deterministic evaluator cannot. This is the real lock-in.
- **The verdict is a neutral contract independent of how it was produced.** The
  XState guard consumes the runtime-validated `{ satisfied, evidenceIds, claims,
source }` and nothing else; it must not know or care whether a judge, a compiled
  check, or an override produced it. `source` is open (`"llm-judge" | "override" |
"compiled-check"`).

Get these two right and the live judge can later be demoted (or eliminated) without
touching callers, evidence, or guards.

## Deferred (not built here)

The design leaves room for these; **none are in build scope for this branch.**
Adding them later means adding evidence-row kinds and (for time-based gates) a
durable job — not reworking the gate model.

- Non-entity evidence sources: tool results, confirmations, jobs, metrics, webhooks, transcript excerpts.
- Metric-over-time gates (e.g. "LinkedIn traffic +200%").
- Long-lived runs that pause and re-evaluate when async evidence arrives later.
- Run deadlines / timeouts.
- Durable delayed jobs in `@brains/job-queue`, and any scheduler (content-pipeline's
  `SchedulerBackend` is in-memory/config-driven; if recurring pulls are ever needed
  it should be extracted to a shared package and owned by the producing plugin, never
  by playbooks).

Playbooks stays a pure evidence _reactor_: it never schedules or polls; gate
re-evaluation is triggered by evidence arrival.

### Verifier evolution (deferred)

The live LLM judge that ships now is **deterministic-first's escape valve**, not the
final design. The intended evolution, enabled by the two locked contracts above:

- **Now:** every gate is read by the live judge on `NEXT` (with the citation guard).
  It is the only mechanism, and it is fine for onboarding's two gates.
- **Later (when gates multiply):** a **compile step** uses the LLM _once per gate, at
  authoring time_, to translate the prose Done When into a structured evidence check
  (a reviewable schema object, not generated code), cached and keyed by
  prose-hash + grammar-version, recompiled on edit. At runtime that check is evaluated
  **deterministically** — no model on the transition path, no mis-attribution, fully
  unit-testable. The LLM becomes a compile-time translator the author reviews once,
  rather than a per-run scorer.

Routing is then: a gate with a compiled check → deterministic evaluation; otherwise →
the live judge. So the judge built now is not throwaway — it is the permanent
fallback tier the compiler sits in front of.

One product fork is left open and does **not** need deciding now (both reach from the
same locked contracts):

- **Permissive:** allow genuinely fuzzy gates ("the operator seems engaged") and keep
  the live judge as a permanent runtime fallback for them.
- **Strict:** require every gate to be an observable outcome — then every gate
  compiles, runtime is always deterministic, and "won't compile" is an _authoring
  error_ ("rephrase as something I can have evidence for"), eliminating the runtime
  judge entirely.

Building the compiler, the evidence-query grammar, and the compile-review surface is
out of scope for this branch.

## Playbook entity

A shared `@brains/playbook` package (not Rover-only — it is reusable from day one).
Structured markdown: frontmatter for metadata, body parsed with the shared
structured-content formatter.

```ts
interface PlaybookBody {
  purpose: string;
  operatingRules: string[];
  initialState: string;
  states: Array<{
    id: string;
    title: string;
    instructions: string[]; // teaching/guidance the agent follows (non-gating)
    doneWhen?: string[]; // plain-prose gate; omitted/empty => NEXT ungated
    transitions: Array<{ event: string; target: string; description?: string }>;
  }>;
  finalStates: string[];
  nextPrompts?: string[];
}
```

Seed at `brains/rover/seed-content/playbook/rover-onboarding.md`:

```md
---
title: Rover Onboarding
status: active
audience: anchor
trigger: first-anchor-web-chat
---

## Purpose

Teach the operator how Rover works by doing useful setup work.

## Operating Rules

- Ask one question at a time.
- Teach by doing real actions; explain what just happened and why.
- Do not publish anything unless the operator explicitly asks and confirms.

## Initial State

welcome

## States

### welcome

Title: Welcome and orientation

Instructions:

- Explain Rover briefly as a personal knowledge and publishing brain.
- Ask whether to continue.

Transitions:

- NEXT -> identity
- SKIP -> complete

### identity

Title: Identity setup

Instructions:

- Ask one question at a time about name, role, audience, expertise, tone.
- Summarize, then create or update the anchor profile with existing tools.

Done when:

- The anchor profile has been created or updated.

Transitions:

- NEXT -> first-knowledge-seed
- SKIP -> first-knowledge-seed

### first-knowledge-seed

Title: First knowledge seed

Instructions:

- Ask for one rough idea, note, link, or fragment; save it as the right entity.
- Explain how Rover can retrieve and repurpose it later.

Done when:

- A first knowledge seed has been saved.

Transitions:

- NEXT -> retrieval-demo

## Final States

- complete
```

Authoring guidance (not a hard rule): phrase a Done When as an observable outcome
the runtime can have evidence for ("a profile was created"), not an internal state
("the operator understands retrieval"). Editing a Done When's text redefines that
gate and re-judges it — intended, since the words _are_ the meaning of "done."

## Playbooks plugin (`@brains/playbooks`)

```text
plugins/playbooks/
  src/index.ts
  src/plugin.ts
  src/db/        # drizzle schema + run repository (SQLite)
  test/
```

Responsibilities: load/parse playbook entities (fail loudly on structural errors);
build XState machines with gate guards; run tools; collect entity-event evidence
for the active run; verify gates via the LLM judge; inject active state into agent
context; resolve lifecycle triggers and web-chat starters. It does **not** own
durable content — that's the `playbook` entity.

### Run store

Operational state, in SQLite/drizzle (the pattern used by job-queue,
conversation-service, entity-service) — replacing the current JSON store, which
does an unlocked whole-file read-modify-write and loses concurrent updates.

- One run **row** (scalar/normalized state) + two **append-only child tables**:
  `playbook_run_evidence`, `playbook_run_verdicts`. Evidence arrives async from
  event subscribers, so it must be independent `INSERT`s, never a JSON array
  rewritten on the run row (that reintroduces the lost-update race).
- Each run pins the playbook **version (content hash)** it started under; a
  transition against a changed definition fails loudly rather than drifting.

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
  // evidence[] and gateVerdicts[] are views over the child tables:
  evidence: Array<{
    id: string;
    kind: "entity_event" | "override";
    stateId?: string;
    observedAt: string;
    data: Record<string, unknown>;
  }>;
  gateVerdicts: Array<{
    stateId: string;
    condition: string;
    conditionHash: string;
    evidenceWatermark: string; // cache key component for the evidence set judged
    satisfied: boolean;
    source: "llm-judge" | "override" | "compiled-check"; // "compiled-check" reserved for the deferred compiler; only "llm-judge"/"override" ship now
    evidenceIds: string[];
    claims: Array<{
      evidenceId: string;
      kind: string;
      data: Record<string, unknown>;
    }>;
    missing?: string[];
    reasoning?: string;
    evaluatedAt: string;
  }>;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}
```

### Tools (anchor-only)

```text
playbook_start          start or resume a run; init the machine at initialState
playbook_status         current state, valid/blocked events, Done When, verdict, missing evidence
playbook_send_event     send an event; for NEXT, judge the gate, validate citations/claims, then snapshot.can(NEXT)
playbook_override_event  anchor-only, confirmation-required gate bypass (records an override verdict)
playbook_complete       allowed only at a final state
playbook_dismiss        hide/postpone without deleting progress
playbook_reset_run      restart for testing/reruns
playbook_validate       structural validation (see below), author-facing errors
```

For gated `NEXT`, `playbook_send_event` asks the judge, validates every satisfied
condition's cited evidence and typed claims against the evidence table, stores the
validated verdict, updates machine context, then relies on `snapshot.can(NEXT)`. A
cached satisfied verdict is reused only when `playbookVersion + stateId +
conditionHash + evidenceWatermark` are unchanged. If the judge call fails, times
out, or returns invalid structured output, `NEXT` blocks and `playbook_status`
reports the verifier error; only `playbook_override_event` can bypass.

Run-scoped tools (`playbook_send_event`, `playbook_status`) infer the run from an
explicit `conversationId` or `ToolContext.conversationId` when `runId` is omitted,
and error if more than one active run exists for the conversation — the same
inference `playbook_start` already does. Entity evidence is collected automatically by event
subscription; there is no `playbook_record_entity` self-reporting tool. The
current prototype tool must be removed before merge.

`playbook_validate` (and the same check at parse time) is **structural only**:
`initialState`/transition targets/`finalStates` exist, no duplicate state IDs, no
unreachable states. A `NEXT` transition is gated iff the state has non-empty Done
When text; omitted/empty Done When means `NEXT` is ungated for that state. Done When
prose has no syntax to validate.

## Agent integration

The plugin subscribes to the agent-context request channel and, when a run is
active, injects the run ID (in plain text), current state, instructions, Done When
conditions, verifier status / missing evidence, and valid vs blocked events — not
only in provenance metadata, so the model can see why a transition is blocked.

Registered agent instructions (concise): start the configured playbook on request;
call `playbook_status` before deciding; follow the state's instructions and rules;
advance only via `playbook_send_event` (the runtime verifier decides gated
transitions); ask one question at a time; teach by doing and explain after; if a
transition is blocked, read `playbook_status` and do the real work rather than
retrying; don't publish without explicit confirmation.

## Rover wiring

Rover maps lifecycle → playbook and seeds the markdown; no inline states in TS.

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

Web-chat asks the plugin for lifecycle starters (`playbooks:lifecycle-starters`)
and, on an empty conversation with a starter available, shows an assistant-style
invitation card whose button sends `starterPrompt` as a normal user message. No
auto-send on load. Enabled only on presets with an anchor web-chat surface
(`default`, `full`).

Run state in the UI (decision on invariant: surface a little, deliberately): a
**resume affordance** for an interrupted/dismissed run, and a **structured "blocked"
signal** (current step + what's missing + Keep going / Skip), rather than relying on
the model to paraphrase it. Nothing more for MVP.

## Phases

1. **Playbook entity** — `@brains/playbook` package: schema, formatter, markdown
   adapter, structural parse-time validation, Rover seed content.
2. **Runtime plugin** — `@brains/playbooks`: XState build with gate guards; SQLite
   run store (version pin, evidence/verdict child tables); tools incl.
   `playbook_send_event`, `playbook_override_event`, `playbook_validate`; agent
   instructions; lifecycle starter handler.
3. **Evidence + verifier** — entity `created`/`updated` collector (events carry
   neutral mutation provenance: `conversationId` when known, `channelId` separately,
   plus `runId`/`toolCallId` when available, so evidence correlates to the run
   without treating transport channels as conversations); LLM-judge verifier behind
   a swappable interface; citation + typed-claim validation; agent-context injection.
4. **Confirmation hardening** (`shell/ai-service`) — confirmation is a first-class
   stop condition that terminates the turn and surfaces the approval card; it never
   appears as a generic tool result.
5. **Rover + web-chat** — wire the lifecycle and preset; starter card + resume +
   blocked signal in `interfaces/web-chat`.
6. **Validate** — see below.

Tests come before fixes (TDD). Split by what they cover, not by gate type:

- **Plumbing — deterministic, stubbed verifier:** machine blocks `NEXT` on an
  unsatisfied verdict and allows it on a satisfied one; a `satisfied` verdict citing
  empty/missing evidence or making an unsupported typed claim is downgraded to
  blocked; judge failure/timeout/invalid output blocks `NEXT`; cached verdicts are
  reused only for the same condition/evidence cache key; `SKIP` bypasses gating;
  evidence collection records the right rows; run inference resolves the active run;
  concurrent transitions don't lose updates; a stale-version transition fails loudly;
  confirmation is terminal and not a generic result.
- **Judge — eval fixtures** (`@brains/ai-evaluation` patterns, structured-output
  judge; do not embed the offline eval runner): asserted structurally (verdict shape;
  does not report satisfied when the required evidence is absent), never by pinning a
  score.

## Validation

- Targeted tests for `@brains/playbook` and `@brains/playbooks` (parse-time
  validation, concurrent-transition safety, gate enforcement).
- `@brains/ai-service` confirmation tests when touching the tool loop.
- `bun run typecheck` for changed packages and `brains/rover`; web-chat UI build if
  frontend changes.
- Smoke test from a **clean** test-app data dir (`cd brains/rover && bun start:full`)
  and capture a transcript showing: advances past welcome once; updates or explicitly
  skips the profile with the update present as real evidence (not a self-report);
  saves a first seed; demonstrates retrieval; handles one confirmation cleanly with no
  stray `Result` block; never uses `playbook_override_event` on the happy path.
- `bun run docs:check` for link changes in this plan.

## Decisions

Load-bearing; revisit only with a documented reason.

1. **`playbook` is a shared package from the start** — reusable beyond onboarding;
   a later promotion would churn imports.
2. **Gates are prose, judged by an LLM, on the transition path** — authors write
   sentences, not a query DSL; a judge is the only general way to evaluate arbitrary
   prose against evidence. Bounded by: `NEXT`-only, cached, citation-and-claim-guarded
   (closes fabrication and citation-inconsistency false-positives; the
   irrelevant-but-honestly-labeled citation residual stays until the compiler),
   override-escape (against false-negatives),
   and stub-tested enforcement. No `check`/`EvidenceQuery`/ID apparatus. The live
   judge is deterministic-first's escape valve, not the final design — see
   [Verifier evolution](#verifier-evolution-deferred).
3. **Two verifier contracts are locked now so it can evolve** — evidence is stored as
   structured typed rows (not opaque text), and the verdict is a neutral
   `{ satisfied, evidenceIds, claims, source }` the guard consumes after runtime
   validation without knowing how it was produced. These keep the live judge swappable for a later compiled-check evaluator
   without touching callers, evidence, or guards.
4. **Gates are XState guards over verdicts** — `buildMachine` seeds the actor with
   verdict state; the handler is a thin pass-through. The machine, not the handler or
   model instruction, is the transition authority.
5. **Confirmation is a stop condition in `shell/ai-service`** — the loop stops and
   surfaces the approval card; the requesting tool still returns its `needsConfirmation`
   payload. Not a thrown exception at the SDK boundary (which would feed back as a tool
   error).
6. **Run state is SQLite/drizzle now** — version-pinned, with append-only evidence/
   verdict child tables. The JSON store is not a stepping stone.
7. **One active run per conversation; one lifecycle starter** — run inference depends
   on it; concurrent runs per conversation are out of scope.
8. **Identity stays one state** — prose gate + clearer context should fix early
   advancement without splitting the machine; revisit only if it still over-advances.
9. **Onboarding only on anchor web-chat presets** (`default`, `full`) — it is
   anchor-only and web-chat-first.
