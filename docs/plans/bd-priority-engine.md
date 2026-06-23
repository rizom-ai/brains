# Plan: BD Priority Engine

## Status

Proposed. Adapted from Sam's feature blueprint ("BD Priority Engine — Feature
Blueprint") into a Brains-native implementation plan. The open product decisions
have been resolved with Jan Hein (see [Decisions](#decisions)); the only
remaining deferral is which brain composes the package, which does not block the
build. Ready to break into phased work.

## Goal

Give the Rizom team a clear, reasoned answer to one question at any moment:
**"What should I work on right now — and what can safely wait?"** Rizom runs
many leads/projects at once; without a system, prioritization is intuitive until
it isn't, and leads go cold in the gaps. This feature is a lightweight,
conversational prioritization layer over a project knowledge base — it captures
opportunities, scores them on a fixed rubric, ranks them, and surfaces focus and
stale-item alerts. It is **not** a task manager, **not** a CRM, and **not**
autonomous: it surfaces a recommendation; the humans make the call.

## What exists today (fact-check)

- **`project` is already a taken entity type.** `entities/portfolio`
  (`@brains/portfolio`, Rover `full` preset) defines a durable `project` entity,
  but it is a **publishing showcase** (title, slug, year, cover/og image,
  `context`/`problem`/`solution`/`outcome` body) with a publish lifecycle only —
  no state, score, owner, or deadline. This feature must use a **distinct
  entity** (working name `opportunity`) and must not overload portfolio's
  `project`.
- **No lead / opportunity / pipeline / CRM / BD entity exists** — greenfield.
- **Reference patterns to copy** (all `EntityPlugin`-based):
  - `entities/wishlist` — durable entity, enum `status` + `priority`, a counter
    field, `interceptCreate` for semantic dedup, a `ListWidget` dashboard tile.
  - `entities/assessment` — derived entity that auto-regenerates from source
    entity changes; React dashboard widget; `derive` job handler.
  - `entities/agent-discovery` — durable entity with a status lifecycle, a
    `BaseEntityDataSource` (list/detail/filter/navigation), list/detail
    templates, a dashboard widget, and rich `getInstructions()`.
- **Primitives the dynamic parts need:**
  - Ranking → a read-only **`DataSource`** (`fetch(query, schema, context)`)
    that computes the stack on demand. Deterministic from stored fields, so no
    persisted/derived ranking entity is needed (avoids staleness).
  - Heartbeat → a **daemon** (or self-re-enqueuing delayed job; there is no
    native cron) that scans on a weekly cadence, with `context.runtimeState`
    for per-item alert dedup and `notifications:send` to deliver the alert.
  - Reactive freshness → entity lifecycle events (`entity:created/updated/
deleted`) via `context.messaging.subscribe`, only if any field is derived.

## Core logic (normalized from the blueprint)

One durable `opportunity` entity per lead/project, with a `type`
(`commercial` / `grant` / `partnership` / `internal`).

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

| State    | Meaning                                             | Owner          |
| -------- | --------------------------------------------------- | -------------- |
| `active` | Being worked now; needs team support                | Jan Hein       |
| `staged` | High value, waiting for a lead's window             | Sam/Natalie/Jo |
| `warm`   | Lower urgency, cannot be dropped; needs a heartbeat | Sam/Natalie    |
| `closed` | Done, declined, or dead                             | —              |

Rule: **max 2 `active`** at once. State is stored on the entity (a human
decision), but the engine _suggests_ it from rank:

- top ≤2 eligible (integrity ≥ 1) → **Active**;
- of the rest, total **≥ 11 → Staged**, **< 11 → Warm**.

A human confirms; the suggestion never auto-moves an opportunity.

## Rover surface

- **Input** (stored per opportunity): name, type, state, the three value scores,
  integrity score, optional hard deadline, `lastActionAt` + `lastActionBy`,
  owner. Set via `system_create`/`system_update` (with `interceptCreate` for
  capture ergonomics). **Scoring is AI-suggested at capture** (Shape A): from
  your description Rover pre-fills the four scores with a one-line rationale
  each, shown in the confirmation card; you accept or edit before it saves.
  Manual entry is always available, and the human always commits — the model
  proposes, it never decides.
- **Output** (three views):
  - **Focus** — "This week, focus on A and B — here's why" (top ≤2 eligible,
    one-line rationale each).
  - **Stack** — full ranked list with scores, states, owners.
  - **Heartbeat** — Warm items with no `lastActionAt` in 14 days (scanned
    weekly, Monday); "assign a next action."

## Phased delivery (thin vertical slices, TDD)

Each phase ships an end-to-end usable increment; write the tests first.

- **Phase 0 — Walking skeleton: capture.** New `entities/bd` package
  (`@brains/bd`) with the `opportunity` entity (schema, adapter, `EntityPlugin`,
  `getInstructions()`), captured through `system_create` with **manually entered**
  scores. Done when you can save an opportunity with scores + state and read it
  back. _Tests:_ schema validation, markdown round-trip, state/score field
  constraints.
- **Phase 1 — Ranking + Stack view.** An `opportunity` `DataSource` that computes
  `total` (formula above, integrity-0 disqualification, +3 urgency ≤ 30 days) and
  returns the ranked stack; a `bd_stack` tool/template. _Tests:_ formula cases,
  the disqualification gate, urgency boundary (29/30/31 days), tie/ordering.
- **Phase 2 — Focus view + state suggestion.** `bd_focus` returns the top ≤2
  eligible with rationale and proposes Active / Staged (≥ 11) / Warm (< 11)
  against the max-2-Active limit; the human confirms. _Tests:_ focus selection,
  max-2-Active enforcement, the ≥ 11 threshold, rationale shape.
- **Phase 3 — AI suggest-at-capture (Shape A).** `interceptCreate` runs Sam's
  0–5 rubric (in plugin instructions) over the described opportunity and
  pre-fills the four scores + rationale into the confirmation card; the human
  accepts/edits before save. Manual entry still works. _Tests:_ rubric prompt
  produces in-range scores, human edit overrides the suggestion, confirmation
  card carries the rationale.
- **Phase 4 — Heartbeat.** Weekly Monday daemon (or self-re-enqueuing delayed
  job — no native cron) scans Warm items with no `lastActionAt` in 14 days →
  `notifications:send`, deduped via `runtimeState`; plus an on-demand
  `bd_heartbeat` tool. _Tests:_ stale detection at the 14-day boundary, dedup
  (no repeat inside the window), reset after a new action.
- **Phase 5 — Dashboard widgets.** Stack tile and Heartbeat tile on the brain
  dashboard (model on `entities/wishlist` `ListWidget` and the
  `agent-discovery` widget). _Tests:_ dataProvider output shape, empty states.

## Decisions

Resolved with Jan Hein:

1. **Packaging.** Build as a standalone `entities/bd` package (`@brains/bd`),
   composed into whichever brain Rizom chooses — **kept out of Rover's public
   reference preset**. Which brain actually composes it is deferred to
   composition time and does not block the build.
2. **Integrity semantics.** `0` = hard disqualify (never Active, regardless of
   value); `1–5` contribute `integrity × 1.5`.
3. **Staged vs Warm threshold.** Of the non-Active opportunities, total **≥ 11
   → Staged**, **< 11 → Warm**. Tunable later.
4. **Stale window.** Warm item is stale at **14 days** without a logged
   `lastActionAt`; scan runs **weekly on Monday**.
5. **Entity name.** `opportunity` (umbrella over commercial lead / grant /
   partnership / internal), distinct from the existing portfolio `project`.
6. **Scoring model.** **AI suggest-at-capture + confirm** (Shape A): Rover
   pre-fills scores from the description; the human accepts/edits before save.
   Delivered in Phase 3; manual entry available from Phase 0. Full derived
   auto-scoring (the `assessment` pattern) is a deliberate later option, not v1.

## What this is not

Not a task manager (no to-dos), not a CRM (no relationship tracking), not
autonomous (surfaces recommendations; humans decide), not permanent (scores are
reassessed on the weekly cadence; nothing is locked).
