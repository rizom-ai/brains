# Plan: Business Development Priority Engine

## Status

In progress on `feat/opportunity-priority-engine`. Adapted from Sam's Business
Development Priority Engine feature blueprint into a Brains-native implementation
plan. The shared package/entity name is resolved as
**business-development** for the package and **opportunity** for the entity.
Phase 0 capture, Phase 1 ranking/stack, Phase 2 focus/state-suggestion, and the
first dashboard focus widget have an initial implementation in
`entities/business-development`; remaining business-development-local work starts
at capture-eval hardening, composition into a Rizom brain, and any dashboard
follow-through that does not depend on the shared heartbeat abstraction. The heartbeat requirement is now explicitly split out: stale
opportunity detection belongs here, but scheduling/dedupe/notification delivery
must be a shared recurring-check abstraction, not opportunity-specific code.

## Goal

Give the Rizom team a clear, reasoned answer to one question at any moment:
**"What should I work on right now — and what can safely wait?"** Rizom runs
many opportunities at once; without a system, prioritization is intuitive until
it isn't, and leads go cold in the gaps. This feature is a lightweight,
conversational prioritization layer over an opportunity knowledge base — it
captures opportunities, scores them on a fixed rubric, ranks them, and surfaces
focus and stale-item alerts. It is **not** a task manager, **not** a CRM, and
**not** autonomous: it surfaces a recommendation; the humans make the call.

## What exists today (fact-check)

- **`project` is already a taken entity type.** `entities/portfolio`
  (`@brains/portfolio`, Rover `full` preset) defines a durable `project` entity,
  but it is a **publishing showcase** (title, slug, year, cover/og image,
  `context`/`problem`/`solution`/`outcome` body) with a publish lifecycle only —
  no state, score, owner, or deadline. This feature must use a **distinct
  entity** named `opportunity` and must not overload portfolio's `project`.
- **No lead / opportunity / pipeline / CRM entity exists** — greenfield.
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
  - Heartbeat → **not a one-off daemon in this package**. The reusable primitive
    should be a shared recurring-check/heartbeat service or plugin contract that
    handles cadence, runtime-state dedupe, and notification delivery. This
    package should contribute only the opportunity-specific stale rule.
  - Reactive freshness → entity lifecycle events (`entity:created/updated/
deleted`) via `context.messaging.subscribe`, only if any field is derived.

## Core logic (normalized from the blueprint)

One durable `opportunity` entity per opportunity, whether commercial lead,
grant, partnership, or internal strategic work, with a `type` (`commercial` /
`grant` / `partnership` / `internal`).

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

## Brain surface

- **Input** (stored per opportunity): name, type, state, the three value scores,
  integrity score, optional hard deadline, `lastActionAt` + `lastActionBy`,
  owner. Set via `system_create`/`system_update`; `system_create.fields` is the
  structured input path and core hydrates those fields through the registered
  frontmatter schema/adapter before persisting markdown. **Scoring is
  AI-suggested at capture** (Shape A): from your description the agent proposes
  scores in structured `fields` and puts only context/rationale prose in
  `content`, so the existing `system_create` confirmation preview shows what
  will be saved before the human accepts or edits. Do **not** route this through
  a generic prompt-generation stub or hand-written YAML frontmatter. Manual
  entry is always available, and the human always commits — the model proposes,
  it never decides.
- **Output** (three views):
  - **Focus** — "This week, focus on A and B — here's why" (top ≤2 eligible,
    one-line rationale each).
  - **Stack** — full ranked list with scores, states, owners.
  - **Heartbeat** — Warm items with no `lastActionAt` in 14 days should surface
    as "assign a next action" alerts through the shared heartbeat abstraction
    once that exists.

## Heartbeat architecture finding

The original blueprint treated the Warm-item heartbeat as if `opportunity` could
own a weekly daemon. That would create one-off scheduling, dedupe, and
notification code in a domain package, then repeat the same pattern for the next
plugin that needs stale checks.

Decision: **do not implement opportunity-specific heartbeat infrastructure.**
Build or extract a shared recurring-check abstraction first. That shared layer
owns:

- cadence/scheduling, including weekly checks;
- runtime-state dedupe windows;
- delivery through `notifications:send` or later notification sinks;
- testable contracts for no-repeat and reset behavior.

`@brains/business-development` owns only the domain rule: a Warm opportunity is
stale when `lastActionAt` is absent or at least 14 days old (falling back to
`created` when needed), and any optional read surface that reports those stale opportunities.
This means heartbeat implementation is blocked until the shared abstraction is
planned and tested.

## Phased delivery (thin vertical slices, TDD/evals first)

Each phase ships an end-to-end usable increment; write tests and relevant evals
first.

- **Phase 0 — Walking skeleton: capture.** New `entities/business-development`
  package (`@brains/business-development`) with the `opportunity` entity
  (schema, adapter, `EntityPlugin`, `getInstructions()`), captured through
  `system_create` with **manually entered**
  scores. Done when you can save an opportunity with scores + state and read it
  back. _Tests:_ schema validation, markdown round-trip, state/score field
  constraints.
- **Phase 1 — Ranking + Stack view.** An `opportunity` `DataSource` that computes
  `total` (formula above, integrity-0 disqualification, +3 urgency ≤ 30 days) and
  returns the ranked stack; a `business_development_stack` tool/template.
  _Tests:_ formula cases, the disqualification gate, urgency boundary
  (29/30/31 days), tie/ordering.
- **Phase 2 — Focus view + state suggestion.** `business_development_focus`
  returns the top ≤2 eligible with rationale and proposes Active / Staged (≥ 11)
  / Warm (< 11)
  against the max-2-Active limit; the human confirms. _Tests:_ focus selection,
  max-2-Active enforcement, the ≥ 11 threshold, rationale shape.
- **Phase 3 — AI suggest-at-capture (Shape A).** The plugin instructions and
  evals teach the agent to call `system_create` with structured `fields`
  containing proposed scores/state/type plus prose `content` for context and
  rationale. Core owns the generic hydration path from `fields` + `content` to
  persisted frontmatter markdown, using the registered entity schema/adapter;
  the business-development package must not duplicate that hydration logic. This
  preserves the existing confirmation boundary: the first confirmation card
  previews structured fields before any write. Do **not** implement this as
  `interceptCreate` unless the core create flow gains a separate
  pre-confirmation transform hook. Manual entry still works. _Tests/evals first:_
  core `system_create.fields` tests, opportunity capture evals asserting
  `fields.*` and no `prompt`, instruction tests for the four 0–5 rubric
  dimensions/integrity hard gate/structured-fields requirement, and
  adapter/schema tests for markdown persistence.
- **Phase 4 — Heartbeat.** Do **not** build a one-off opportunity daemon. First
  extract or introduce a shared recurring-check/heartbeat abstraction that can
  schedule scans, dedupe alerts via `runtimeState`, and route notifications via
  `notifications:send` for any plugin. `opportunity` should only provide the
  domain rule: Warm items with no `lastActionAt` in 14 days are stale, plus an
  on-demand `business_development_heartbeat` read surface if still useful.
  _Tests/evals first:_ shared scheduler/dedupe contract tests, opportunity stale-rule tests at
  the 14-day boundary, no-repeat-inside-window behavior, reset after a new
  action, and a product eval proving stale Warm items are surfaced without
  opportunity-specific scheduler code.
- **Phase 5 — Dashboard widgets.** First slice: a Business Development Focus
  `ListWidget` shows the top ≤2 eligible opportunities and their suggested
  Active priority. Heartbeat-specific dashboard UI waits for the shared heartbeat
  abstraction. _Tests first:_ widget registration, dataProvider output shape,
  empty states, and later heartbeat widget behavior once the shared recurring
  check contract exists.

## Decisions

Resolved with Jan Hein:

1. **Packaging.** Build as a standalone `entities/business-development` package
   (`@brains/business-development`), composed into whichever brain Rizom chooses
   — **kept out of Rover's public reference preset**. Which brain actually
   composes it is deferred to composition time and does not block the build.
2. **Integrity semantics.** `0` = hard disqualify (never Active, regardless of
   value); `1–5` contribute `integrity × 1.5`.
3. **Staged vs Warm threshold.** Of the non-Active opportunities, total **≥ 11
   → Staged**, **< 11 → Warm**. Tunable later.
4. **Stale window.** Warm item is stale at **14 days** without a logged
   `lastActionAt`; weekly Monday scanning belongs to a shared heartbeat/
   recurring-check abstraction, not one-off opportunity code.
5. **Package, entity, and namespace names.** Use `business-development` for the
   package and plugin domain, `opportunity` for the durable entity, and
   `business_development_*` for datasource/tool namespaces. This follows the repo
   convention where packages name the domain/activity and entities name the item
   inside it (for example `portfolio`/`project`). Avoid `bd` abbreviations in
   public package names.
6. **Scoring model.** **AI suggest-at-capture + confirm** (Shape A): the agent
   pre-fills scores from the description as structured create `fields`, then the
   normal create confirmation asks the human to accept/edit before save. Manual
   entry remains available from Phase 0. Full derived auto-scoring (the
   `assessment` pattern) is a deliberate later option, not v1.

## What this is not

Not a task manager (no to-dos), not a CRM (no relationship tracking), not
autonomous (surfaces recommendations; humans decide), not permanent (scores are
reassessed on the weekly cadence; nothing is locked).
