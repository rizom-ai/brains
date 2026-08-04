# Plan: Opportunity Priority Engine

## Status

In progress on `feat/opportunity-priority-engine`. The worktree contains the initial
package with the `opportunity` entity, deterministic ranking/stack, focus and state
suggestions, and a first dashboard widget. Decided 2026-08-04: **one entity, two
services** — a lead is an `opportunity` in the `lead` state, not a separate entity, so
the worktree needs a single-entity rework (packaging split plus the `lead` state and
typed `sources`) before further feature work. Remaining local work after the rework is
capture-eval hardening, composition into a Rizom brain, and focused dashboard
follow-through. Stale-opportunity attention is deliberately blocked on the
`InboxSource` registry, aggregation surfaces, and daily digest defined by
[unified-inbox.md](./unified-inbox.md). Business Development contributes only a live
stale-opportunity source; aggregation, cadence, and notification delivery must not
become business-development-specific.

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
  this plan's worktree. Upstream intake is its own domain: Email Triage is on main and
  persists restricted `mail-item` records; [lead-management.md](./lead-management.md)
  will consolidate them into `lead`-state opportunities. Lead Management and Business
  Development have no direct package dependency: they coordinate through the shared
  entity schema and confirmed system-tool transitions.
- **Reference patterns to copy** (all `EntityPlugin`-based): `entities/wishlist`
  (enum status/priority, semantic dedup, `ListWidget`), `entities/assessment`
  (derived regeneration, React widget, `derive` job handler), and
  `entities/agent-discovery` (status lifecycle, `BaseEntityDataSource`, list/detail
  templates, rich `getInstructions()`).
- **Primitives the dynamic parts need:** ranking → a read-only **`DataSource`**
  computed on demand (no persisted ranking entity, avoids staleness); stale attention →
  a live unified-inbox **`InboxSource`** computed from current opportunity state, with
  Unified Inbox owning its daily recurring digest; reactive freshness → entity
  lifecycle events via `context.messaging.subscribe`, only if any field is derived.

## Packaging (single-entity rework)

- `entities/opportunity` (`@brains/opportunity`) — the entity plugin: schema, adapter,
  `getInstructions()`. Owned here; consumed by both services.
- `plugins/business-development` (`@brains/business-development`) — this plan's
  service: scoring instructions, ranking `DataSource`, narrow stack/focus tools,
  stale-opportunity `InboxSource`, and dashboard widgets. Kept out of Rover's public
  reference preset.
- `plugins/lead-management` (`@brains/lead-management`) — intake and consolidation of
  `lead`-state records; specified in [lead-management.md](./lead-management.md). The two
  service packages do not import each other.

Canonical activation is explicit: `opportunity` is its own capability, and each service
has an unmet-dependency guard for that plugin ID. Service factories do not each install
the entity, which would duplicate registration when both services are selected.

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

interface OpportunityScores {
  income: number; // integer 0–5
  orgBuild: number; // integer 0–5
  brains: number; // integer 0–5
  integrity: number; // integer 0–5; 0 disqualifies from Active
}

interface OpportunitySharedFrontmatter {
  title: string;
  type: OpportunityType;

  // shared facts; schema defaults keep manual capture small
  sources: { entityType: string; entityId: string }[]; // default []
  organization?: string;
  contactPersonIds: string[]; // default []
  lastActivityAt?: string; // falls back to entity.created
  needsReply: boolean; // default false

  // derived narrative (model-writable only in state=lead; see lead-management)
  intent?: string;
  requestedOutcomes: string[]; // default []
  valueContext?: string;
  timing?: string;
  constraints: string[]; // default []

  // human-owned once committed
  deadline?: string;
  owner?: string;
  lastActionAt?: string;
  lastActionBy?: string;
}

type OpportunityFrontmatter =
  | (OpportunitySharedFrontmatter & { state: "lead"; scores?: never })
  | (OpportunitySharedFrontmatter & {
      state: "active" | "staged" | "warm";
      scores: OpportunityScores;
    })
  | (OpportunitySharedFrontmatter & {
      state: "closed";
      scores?: OpportunityScores; // scored deal or ignored unscored lead
    });
```

The union above is the conceptual domain type. The current `EntityAdapter`
`frontmatterSchema` contract requires a `ZodObject`, so implement one canonical object
schema with `scores` optional plus schema-level `superRefine` checks for the three state
cases. Export parsed type guards/narrowing helpers for lead, prioritized, and closed
records so service code does not rely on non-null assertions. `integrity === 0`
additionally forbids `state=active`. `deadline` is a validated `YYYY-MM-DD` date;
`lastActivityAt` and `lastActionAt` are validated ISO datetimes. Every record has
`restricted` visibility, enforced by an entity persist validator; the canonical
capability grants all opportunity entity actions only to Admin callers. The
`system_create.fields` path may carry the requested visibility, but core must check
the **final hydrated markdown** against caller visibility permissions before persistence
so structured fields cannot bypass write authorization. Keep query metadata smaller
than the full frontmatter: title, type, state, organization, needs-reply/activity,
scores, deadline, owner, and last-action facts only. Ordered sources, contact IDs, and
derived narrative arrays remain markdown-owned and are parsed on demand; Lead
Management may rebuild operational matching indexes from them. The markdown body is
the evolving summary — model-written in `lead`, human-owned afterward.

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

## Configuration

Business Development without automated intake:

```yaml
add: [opportunity, business-development]
```

A brain that also consolidates qualifying email adds `email-triage` and
`lead-management`; no fixed bundle or generated instance enables these capabilities.

## Brain surface

- **Input.** Manual and agent-assisted capture both use `system_create` with typed
  `fields` plus `source: { kind: "text", content: "..." }`. The shared-field defaults
  keep a manually entered opportunity small. For a committed opportunity, the agent
  applies the installed 0–5 rubric to the user's description and proposes `state`,
  `scores`, type, owner, and dates in `fields`; rationale remains prose in the source
  content. The ordinary confirmation preview shows those exact values before any
  write. No create interceptor runs AI after confirmation, and no generated prompt stub
  or hand-written YAML frontmatter is used.
- **Qualification.** A `lead → active|staged|warm` transition uses one confirmed
  `system_update` containing the new state and complete scores. Business Development
  contributes the scoring instructions; Lead Management exposes the record and context
  but does not call or import a Business Development API. Ignoring a lead is the
  separate confirmed transition `lead → closed` without scores.
- **Output.** `opportunity_focus` answers "what should I work on now?" with the top ≤2
  eligible records and concise rationale. `opportunity_stack` returns the complete
  ranked committed set with scores, states, and owners. Stale Warm opportunities appear
  through Unified Inbox's `inbox_list`, dashboard, and daily digest; Business
  Development does not add a duplicate heartbeat tool or notification cadence.

## Phased delivery (thin vertical slices, TDD)

Each phase ships an end-to-end usable increment; write the tests first.

- **Phase 0R — Single-entity rework.** Split the worktree package into
  `entities/opportunity` + `plugins/business-development`; add the state-refined entity
  schema and narrowed stage helpers, `lead`, typed `sources`, derived narrative fields,
  schema defaults, date validation, restricted-visibility validator, Admin entity-action
  policy, separate canonical capability entries, and service dependency guard. Harden
  `system_create.fields` so caller authorization is checked against final hydrated
  visibility. Update the widget to the current dashboard namespace and
  `SYSTEM_CHANNELS.pluginsRegistered`. _Tests:_ schema-level state/score constraints and
  narrowing helpers; integrity-0 never Active; defaults and date validation for manual
  capture; restricted-only persistence; structured fields cannot bypass visibility
  permissions; markdown round-trip with and without scores; metadata excludes sources
  and narrative arrays; ranking/stack/focus
  exclude `lead` and `closed`; widget registration uses the current contract.
- **Phase 1 — Ranking + Stack view.** (Worktree: implemented — move and revalidate
  after 0R.) Register an `opportunity` `DataSource` computing `total` with the
  disqualification gate and ≤30-day urgency bump, plus the narrow read-only
  `opportunity_stack` tool/template. _Tests:_ formula cases, gate, urgency boundary
  (29/30/31 days), deterministic tie ordering, output includes dimension scores.
- **Phase 2 — Focus view + state suggestion.** (Worktree: implemented — move and
  revalidate after 0R.) `opportunity_focus` returns the top ≤2 eligible committed
  opportunities with rationale and proposes Active / Staged (≥11) / Warm (<11).
  _Tests:_ focus selection, max-2-Active enforcement, threshold, rationale shape, no
  `lead` or `closed` leakage.
- **Phase 3 — AI suggest-at-capture and qualification (Shape A).** Teach the agent via
  Business Development instructions and evals to propose structured create/update
  fields before invoking the ordinary confirmed system tools. Do **not** use
  `interceptCreate`: core runs create interceptors after the first confirmation, too
  late to prefill it. Manual entry remains available. _Tests/evals:_ `source.kind=text`;
  complete in-range scores in structured fields; human values are preserved; no
  `prompt` or hand-written frontmatter; confirmation preview carries proposed values;
  one confirmed update moves a lead without copying it or adding a package dependency.
- **Phase 4 — Unified Inbox source.** Blocked on Unified Inbox's source registry and
  aggregation surfaces. Register a live stale-opportunity `InboxSource`: a Warm record
  is stale at 14 days since `lastActionAt ?? lastActivityAt ?? created`. The source
  returns content-safe items and entity references with no synthetic dismiss/touch
  action: the record disappears only after a real action timestamp or state change. It
  owns no timer, runtime dedupe, direct notification, or duplicate read tool. Unified
  Inbox owns its daily digest and `inbox_list`. _Tests:_ exact 14-day boundary; fallback
  order; content-safe mapping; empty action list and unknown-action rejection; item
  disappears after a new action or state change; one source failure cannot affect other
  inbox sources.
- **Phase 5 — Dashboard focus widget.** Move the existing Focus `ListWidget` to the
  service package and current dashboard contract. Heartbeat-specific UI remains in
  Unified Inbox. _Tests:_ registration, data shape, digest summary, empty state.

## Decisions

Resolved with Jan Hein:

1. **Packaging.** One shared entity package plus one Business Development service
   package (see Packaging above), composed into whichever brain Rizom chooses and kept
   out of fixed public bundles. `opportunity` is selected explicitly before either
   service; Lead Management is a second consumer, not a dependency of Business
   Development.
2. **Integrity semantics.** `0` = hard disqualify (never Active, regardless of
   value); `1–5` contribute `integrity × 1.5`.
3. **Staged vs Warm threshold.** Of the non-Active opportunities, total **≥11 →
   Staged**, **<11 → Warm**. Tunable later.
4. **Stale window and attention ownership.** A Warm item is stale at **14 days** since
   `lastActionAt ?? lastActivityAt ?? created`. Business Development contributes a live
   Unified Inbox source only; Unified Inbox owns listing, dashboard aggregation, daily
   digest cadence, and notification delivery.
5. **Entity and package name.** Use `opportunity` for the entity package and read-tool
   namespace (umbrella over commercial deal / grant / partnership / sponsorship /
   employment / internal), distinct from portfolio's `project`. Use
   `business-development` for the scoring/ranking service.
6. **Scoring model.** **AI suggest-at-capture + confirm** (Shape A): agent instructions
   produce structured fields before `system_create` or `system_update`; the ordinary
   confirmation shows them and the human accepts or edits. `interceptCreate` is not the
   scoring path because it runs after initial confirmation. Full derived auto-scoring
   remains a deliberate later option, not v1.
7. **Single entity, staged lifecycle** (2026-08-04). A lead is an `opportunity` in
   `state=lead`. There is no separate lead entity, promotion copy, or back-pointer;
   qualification is a confirmed state-and-scores update on the same record.
8. **Cross-service boundary.** Lead Management and Business Development do not import
   or call each other. Both depend on `@brains/opportunity`; coordination happens via
   entity state and confirmed shared system tools. Lead Management's model never writes
   state, scores, owner, or deadline.
9. **Visibility and authorization.** Every opportunity is `restricted`; persistence
   validates that invariant and the canonical capability requires Admin for all entity
   actions. Core authorizes the final hydrated create visibility so structured fields
   cannot bypass the write boundary.

## What this is not

Not a task manager (no to-dos), not a CRM (no relationship tracking), not
autonomous (surfaces recommendations; humans decide), not permanent (scores may be
reassessed through the same confirmed update flow; nothing is locked).

## Related plans

- [lead-management.md](./lead-management.md) — intake and consolidation of
  `lead`-state records; qualification transition.
- [email-triage.md](./email-triage.md) — upstream derived mail items.
- [unified-inbox.md](./unified-inbox.md) — shared attention registry, surfaces, and
  digest this plan's stale-opportunity source waits on.
