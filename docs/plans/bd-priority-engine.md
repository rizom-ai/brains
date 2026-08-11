# Plan: Opportunity Priority Engine

## Status

In progress on `feat/opportunity-priority-engine`. The worktree contains the initial
package with the `opportunity` entity, deterministic ranking/stack, focus and state
suggestions, and a first dashboard widget. Decided 2026-08-04: **one entity, two
services** — a lead is an `opportunity` in the `lead` state, not a separate entity, so
the worktree needs a single-entity rework (packaging split plus the `lead` state and
typed `sources`) before further feature work. Remaining local work after the rework is
capture-eval hardening, composition into a Rizom brain, and focused dashboard
follow-through. Stale-opportunity alerts are deliberately blocked on the shared
infrastructure provided by [`@brains/unified-inbox`](../../plugins/unified-inbox/README.md) (`InboxSource` +
`recurring-checks`); scheduling, dedupe, and notification delivery must not become
business-development-specific.

## Goal

Give the Rizom team a clear, reasoned answer to one question at any moment:
**"What should I work on right now — and what can safely wait?"** Rizom runs
many opportunities at once; without a system, prioritization is intuitive until
it isn't, and opportunities go cold in the gaps. This feature is a lightweight,
conversational prioritization layer over an opportunity knowledge base — it
captures opportunities, scores them on a fixed rubric, ranks them, and surfaces
focus and stale-item alerts. It is **not** a task manager, **not** a CRM, and
**not** autonomous: it surfaces a recommendation; the humans make the call.

## What exists today (fact-check)

- **`project` is already a taken entity type.** `entities/portfolio`
  (`@brains/portfolio`, Rover `full` preset) defines a durable `project` entity,
  but it is a **publishing showcase** with a publish lifecycle only — no state,
  score, owner, or deadline. This feature uses the distinct `opportunity` entity
  and must not overload portfolio's `project`.
- **No opportunity / pipeline / CRM entity exists on main** — the entity lives only in
  this plan's worktree. Upstream intake is its own domain: email becomes restricted
  `mail-item` records (the shipped
  [`@brains/email-triage`](../../plugins/email-triage/README.md)),
  and [lead-management.md](./lead-management.md) consolidates them into `lead`-state
  opportunities. The two services share only the entity package and never reference
  each other.
- **Reference patterns to copy** (all `EntityPlugin`-based): `entities/wishlist`
  (enum status/priority, `interceptCreate` semantic dedup, `ListWidget`),
  `entities/assessment` (derived regeneration, React widget, `derive` job handler),
  `entities/agent-discovery` (status lifecycle, `BaseEntityDataSource`, list/detail
  templates, rich `getInstructions()`).
- **Primitives the dynamic parts need:** ranking → a read-only **`DataSource`**
  computed on demand (no persisted ranking entity, avoids staleness); heartbeat → the
  unified-inbox `recurring-checks` integration with `context.runtimeState` for
  per-item alert dedup; reactive freshness → entity lifecycle events via
  `context.messaging.subscribe`, only if any field is derived.

## Packaging (single-entity rework)

- `entities/opportunity` (`@brains/opportunity`) — the entity plugin: schema, adapter,
  `getInstructions()`. Owned here; consumed by both services.
- `plugins/business-development` (`@brains/business-development`) — this plan's
  service: capture ergonomics, scoring suggestion, ranking `DataSource`, focus,
  heartbeat, dashboard widgets. Kept out of Rover's public reference preset.
- `plugins/lead-management` (`@brains/lead-management`) — intake and consolidation of
  `lead`-state records; specified in [lead-management.md](./lead-management.md). This
  package never references it.

## `opportunity` entity (owned here)

```ts
const opportunityTypeSchema = z.enum([
  "commercial",
  "partnership",
  "grant",
  "sponsorship",
  "employment",
  "internal",
  "other",
]);

const opportunityStateSchema = z.enum([
  "lead", // inbound, consolidated, unscored — owned by lead-management
  "active",
  "staged",
  "warm",
  "closed",
]);

interface OpportunityFrontmatter {
  title: string;
  type: OpportunityType;
  state: OpportunityState;

  // shared facts
  sources: { entityType: string; entityId: string }[]; // ordered; empty for manual
  organization?: string;
  contactPersonIds: string[];
  lastActivityAt: string;
  needsReply: boolean;

  // derived narrative (model-writable only in state=lead; see lead-management)
  intent?: string;
  requestedOutcomes: string[];
  valueContext?: string;
  timing?: string;
  constraints: string[];

  // committed-stage, human-owned
  scores?: {
    income: number; // 0–5
    orgBuild: number; // 0–5
    brains: number; // 0–5
    integrity: number; // 0–5; 0 disqualifies from Active
  };
  deadline?: string;
  owner?: string;
  lastActionAt?: string;
  lastActionBy?: string;
}
```

Refinements: `scores` are required when `state` is `active | staged | warm` and absent
in `lead`; `integrity === 0` forbids `state=active`. Every record has `restricted`
visibility. The markdown body is the evolving summary — model-written in `lead`,
human-owned afterward.

## Core logic (normalized from the blueprint)

One durable `opportunity` per opportunity, whether commercial deal, grant,
partnership, sponsorship, employment, or internal strategic work.

### Value score (0–15)

Three equal dimensions, each scored 0–5 on a fixed rubric:

- **Income potential** — likelihood and timing of revenue/grant/investment,
  blended into one 0–5 scale (0 = no realistic path … 5 = near-certain,
  imminent).
- **Organizational build** — does it grow Rizom's capacity/network (0 =
  maintenance only … 5 = structurally changes capacity).
- **Brains development** — real use cases/feedback/adoption for the Brains suite
  (0 = no connection … 5 = shapes product direction / reference case).

### Integrity (gate **and** weighted dimension)

Does the opportunity keep Rizom independent (nonprofit-leaning) rather than pull
it toward pure commercial logic? Scored 0–5 on values alignment + terms:

- **`0` is a hard gate** — misaligned values or independence-compromising terms.
  A `0` opportunity is **disqualified**: it may be Staged or declined but can
  never be Active, regardless of value score.
- **`1–5` contribute `integrity × 1.5`** to the total.

### Formula

```
total = (income + orgBuild + brains) + (integrity × 1.5)        # max 22.5
        + 3   if a hard deadline falls within 30 days            # max 25.5
where integrity == 0  ⇒  disqualified (not eligible for Active)
```

The urgency bump keeps time-sensitive work from being permanently displaced by
high-value long-horizon work, without letting deadline pressure alone override
value.

### States (human-owned, tool-suggested)

Every non-closed opportunity is in exactly one state:

| State    | Meaning                                              | Owner           |
| -------- | ---------------------------------------------------- | --------------- |
| `lead`   | Inbound, consolidated, unscored; awaiting a decision | lead-management |
| `active` | Being worked now; needs team support                 | Jan Hein        |
| `staged` | High value, waiting for a lead's window              | Sam/Natalie/Jo  |
| `warm`   | Lower urgency, cannot be dropped; needs a heartbeat  | Sam/Natalie     |
| `closed` | Done, declined, dead, or an ignored lead             | —               |

Ranking, stack, focus, and heartbeat operate only on `active | staged | warm`;
`lead` and `closed` records are invisible to them. Rule: **max 2 `active`** at
once. State is stored on the entity (a human decision), but the engine
_suggests_ it from rank:

- top ≤2 eligible (integrity ≥ 1) → **Active**;
- of the rest, total **≥ 11 → Staged**, **< 11 → Warm**.

A human confirms; the suggestion never auto-moves an opportunity. Entering a
committed state — from manual capture or from qualifying a `lead` — always goes
through the same scoring confirmation.

## Brain surface

- **Input** (stored per opportunity): name, type, state, the three value scores,
  integrity score, optional hard deadline, `lastActionAt` + `lastActionBy`,
  owner. Set via `system_create`/`system_update` (with `interceptCreate` for
  capture ergonomics). **Scoring is AI-suggested at capture** (Shape A): from
  your description the brain pre-fills the four scores with a one-line rationale
  each, shown in the confirmation card; you accept or edit before it saves.
  Manual entry is always available, and the human always commits — the model
  proposes, it never decides. Qualifying a `lead`-state record uses this same
  confirmation card over the record's derived context; there is no separate
  promotion flow.
- **Output** (three views):
  - **Focus** — "This week, focus on A and B — here's why" (top ≤2 eligible,
    one-line rationale each).
  - **Stack** — full ranked list with scores, states, owners.
  - **Heartbeat** — Warm items with no `lastActionAt` in 14 days (scanned
    weekly, Monday); "assign a next action."

## Phased delivery (thin vertical slices, TDD)

Each phase ships an end-to-end usable increment; write the tests first.

- **Phase 0R — Single-entity rework.** Split the worktree package into
  `entities/opportunity` + `plugins/business-development`; add the `lead` state, typed
  `sources`, the derived narrative fields, and the stage refinements. _Tests:_ schema
  refinements (`scores` required in committed states, absent in `lead`; integrity-0
  never Active); markdown round-trip with and without scores; ranking/stack/focus
  exclude `lead` and `closed`; existing formula and widget tests still pass.
- **Phase 1 — Ranking + Stack view.** (Worktree: implemented — revalidate after 0R.)
  An `opportunity` `DataSource` computing `total` with the disqualification gate and
  the ≤30-day urgency bump; an `opportunity_stack` tool/template. _Tests:_ formula
  cases, the gate, urgency boundary (29/30/31 days), tie/ordering.
- **Phase 2 — Focus view + state suggestion.** (Worktree: implemented — revalidate
  after 0R.) `opportunity_focus` returns the top ≤2 eligible with rationale and
  proposes Active / Staged (≥ 11) / Warm (< 11) against the max-2-Active limit.
  _Tests:_ focus selection, max-2-Active enforcement, the ≥ 11 threshold, rationale
  shape.
- **Phase 3 — AI suggest-at-capture (Shape A).** `interceptCreate` runs the 0–5 rubric
  over the described opportunity and pre-fills scores + rationale into the
  confirmation card; the human accepts/edits before save. The same card serves lead
  qualification (lead-management Phase 4). _Tests:_ in-range scores, human edit
  overrides, rationale carried, qualification path reuses the card without a parallel
  flow.
- **Phase 4 — Heartbeat.** Weekly Monday scan of Warm items with no `lastActionAt` in
  14 days, registered through the unified-inbox `recurring-checks`/`InboxSource`
  infrastructure, deduped via `runtimeState`; plus an on-demand
  `opportunity_heartbeat` tool. _Tests:_ stale detection at the 14-day boundary, dedup
  inside the window, reset after a new action.
- **Phase 5 — Dashboard widgets.** Stack tile and Heartbeat tile (model on
  `entities/wishlist` `ListWidget` and the `agent-discovery` widget). _Tests:_
  dataProvider output shape, empty states.

## Decisions

Resolved with Jan Hein:

1. **Packaging.** One shared entity package plus one service package (see Packaging
   above), composed into whichever brain Rizom chooses — kept out of Rover's public
   reference preset. Which brain composes it is deferred to composition time and does
   not block the build.
2. **Integrity semantics.** `0` = hard disqualify (never Active, regardless of
   value); `1–5` contribute `integrity × 1.5`.
3. **Staged vs Warm threshold.** Of the non-Active opportunities, total **≥ 11
   → Staged**, **< 11 → Warm**. Tunable later.
4. **Stale window.** Warm item is stale at **14 days** without a logged
   `lastActionAt`; scan runs **weekly on Monday**.
5. **Entity and package name.** Use `opportunity` for the entity, package, and
   tool namespace (umbrella over commercial deal / grant / partnership /
   sponsorship / employment / internal), distinct from the existing portfolio
   `project`; keep **BD** as Rizom-local copy only, not the shared package name.
6. **Scoring model.** **AI suggest-at-capture + confirm** (Shape A): the brain
   pre-fills scores from the description; the human accepts/edits before save.
   Delivered in Phase 3; manual entry available from Phase 0. Full derived
   auto-scoring (the `assessment` pattern) is a deliberate later option, not v1.
7. **Single entity, staged lifecycle** (2026-08-04). A lead is an `opportunity` in
   `state=lead`, owned by lead-management until qualified. No separate lead entity, no
   promotion copy, no back-pointer; write authority is gated by state
   ([lead-management.md](./lead-management.md) decision 9).

## What this is not

Not a task manager (no to-dos), not a CRM (no relationship tracking), not
autonomous (surfaces recommendations; humans decide), not permanent (scores are
reassessed on the weekly cadence; nothing is locked).

## Related plans

- [lead-management.md](./lead-management.md) — intake and consolidation of
  `lead`-state records; qualification transition.
- [`@brains/email-triage`](../../plugins/email-triage/README.md) — shipped; upstream
  derived mail items.
- [`@brains/unified-inbox`](../../plugins/unified-inbox/README.md) — shared attention/heartbeat
  infrastructure this plan's alerts wait on.
