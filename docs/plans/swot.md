# Plan: SWOT entity & widget

Last updated: 2026-04-20

## Goal

Add a derived `swot` entity that captures the brain's **agent-directory SWOT** as a durable artifact, plus a dashboard widget that renders it as a 2×2 grid.

This should ship as a **separate entity plugin** at `entities/swot/`, not as more logic inside `entities/agent-discovery`. It reads agent-directory state, but it owns its own schema, derivation lifecycle, and widget registration.

The derivation should be **grounded, not free-form**:

1. compute a small deterministic summary from `agent` + `skill` entities
2. ask the LLM to compress that grounded summary into short SWOT items
3. store the result as a single `swot` entity

The widget only reads and renders the stored entity.

## Why

Pure counting is too mechanical for the final surface, but pure LLM synthesis is too loose.

What we want is:

- **stable** output between changes
- **readable** analytical language, not raw metrics
- **grounded** judgments tied to actual directory facts
- **cheap on read** because the cost is paid at derive time, not render time

This also keeps the pattern reusable: a derived analytical entity with a small, typed contract.

## Scope

### In scope

1. new entity plugin at `entities/swot/`
2. single-entity-per-brain model (`id: "swot"`)
3. debounced re-derivation when `agent` or `skill` entities change
4. deterministic context builder over agent-directory state
5. one structured LLM synthesis pass producing the final SWOT entity
6. dashboard widget rendering the stored SWOT as a 2×2 grid
7. first-run behavior when no SWOT entity exists yet

### Out of scope

- broader brain context (`topics`, `notes`, `wishes`, `links`)
- historical SWOT versions
- manual per-item editing
- backlinking from SWOT items to specific agents or skills
- a generic analysis framework or shared analysis plugin
- repo-wide tag infrastructure

## Entity shape

Single entity with id `swot`.

```ts
interface SwotItem {
  title: string; // short headline
  detail?: string; // optional second clause
}

interface SwotBody {
  strengths: SwotItem[];
  weaknesses: SwotItem[];
  opportunities: SwotItem[];
  threats: SwotItem[];
  derivedAt: string; // ISO timestamp
}
```

Validation is strict on write. Invalid model output fails the derivation and leaves the previous entity untouched.

Write semantics are always single-entity:

- the entity id is always `swot`
- successful derivation replaces the full body for that one entity
- failed derivation does not create alternates, duplicates, or partial writes

## Derivation architecture

### Trigger model

Register a dedicated derive job, e.g. `swot:derive`.

The event subscribers should only enqueue that job. They should not perform context assembly or LLM calls inline.

Subscribe to entity lifecycle messages for:

- `entity:created`
- `entity:updated`
- `entity:deleted`

Filter to `entityType === "agent"` or `entityType === "skill"`.

Any matching event schedules a debounced re-derive.

- debounce window: **30s**
- bursts coalesce into one synthesis pass
- v1 does not need a configurable debounce
- event-driven derivation stays disabled until `sync:initial:completed` so startup does not synthesize from partial state
- if a derive job is already queued/running, additional enqueue attempts during the window should be ignored

### Plugin shape

This should be a normal `EntityPlugin` under `entities/swot/`, not a service plugin and not an extension of the `agent-discovery` plugin.

Recommended shape:

- schema + adapter for the durable `swot` entity
- plugin registers the dashboard widget
- plugin subscribes to `agent` / `skill` entity events
- plugin enqueues a derive job rather than doing LLM work inline in the event handler

That keeps event handling cheap and preserves the usual job-based lifecycle.

Concrete package shape:

- `entities/swot/src/schemas/swot.ts`
- `entities/swot/src/adapters/swot-adapter.ts`
- `entities/swot/src/handlers/swot-derivation-handler.ts`
- `entities/swot/src/lib/swot-context.ts` for deterministic context building
- `entities/swot/src/plugin.ts`

Lifecycle should mirror existing entity-plugin patterns:

- subscribe to `sync:initial:completed` to enable event-driven derivation
- subscribe to `system:plugins:ready` to register the dashboard widget
- register a job handler for derivation work

## Grounded context builder

Before calling the LLM, build a deterministic context packet from current directory state.

### Input entities

- all `skill` entities = the brain's own capabilities
- all `agent` entities = external network members

### Status semantics

This is important:

- **approved agents** count as confirmed network capability
- **discovered agents** are review-pending and should not be treated as equally strong evidence

So for v1:

- **Strengths / Weaknesses / Opportunities** should be grounded primarily in **brain skills + approved agents**
- **Threats** may use **discovered agents** for pending-review / uncertainty signals
- discovered-agent skill tags can be passed to the LLM as secondary context, but the prompt should explicitly frame them as tentative

### Deterministic context shape

The exact shape can evolve, but it should look roughly like this:

```ts
interface SwotContext {
  summary: {
    brainSkillCount: number;
    approvedAgentCount: number;
    discoveredAgentCount: number;
    approvedCoverageRatio: number; // fraction of local skills with >=1 approved external source
    uncoveredSkillCount: number;
    singleSourceSkillCount: number;
    pendingReviewCount: number;
  };
  brainSkills: Array<{
    name: string;
    description: string;
    tags: string[];
    approvedCoverageCount: number;
    approvedCoverageAgents: string[];
  }>;
  approvedAgents: Array<{
    brainName: string;
    kind: "professional" | "team" | "collective";
    skills: Array<{ name: string; tags: string[] }>;
  }>;
  discoveredAgents: Array<{
    brainName: string;
    kind: "professional" | "team" | "collective";
    skills: Array<{ name: string; tags: string[] }>;
  }>;
  hints: {
    strongestTags: Array<{ tag: string; sourceCount: number }>;
    uncoveredSkills: string[];
    singleSourceSkills: string[];
    agentOnlyTags: string[];
  };
}
```

The point is not to store this context. The point is to give the model a compact, factual packet so the final SWOT copy is constrained by real signals.

### Matching / aggregation rules

Keep the mechanics simple in v1:

- normalize tags locally with lowercase + trim + dedupe
- count tag coverage by **source** (brain skill or agent), not by raw occurrence count
- dedupe repeated tags within the same skill / same agent
- use skill names and descriptions as additional evidence, but avoid complicated semantic matching in the mechanical layer

The LLM can infer higher-level overlap from the grounded packet. The deterministic layer should stay shallow and legible.

## LLM synthesis contract

The model does **not** invent facts from scratch. It rewrites the grounded context into concise SWOT language.

Prompt rules should explicitly say:

- use only the supplied directory context
- prefer claims supported by multiple approved sources
- treat discovered agents as tentative, mostly relevant to threats / pending review
- do not mention entities outside the agent directory
- do not mention specific agent names unless absolutely necessary; prefer capability-area language
- produce short operator-facing statements, not essays
- keep each quadrant to **2–3 items** when possible
- avoid repeating the same capability area across multiple quadrants unless the contrast is genuinely useful

### Quadrant intent

- **Strengths** — areas with depth, redundancy, or strong approved external coverage
- **Weaknesses** — local capabilities with thin backup or no approved external support
- **Opportunities** — adjacent capabilities the network adds that the brain does not currently represent locally
- **Threats** — pending-review backlog, single points of failure, over-reliance on tentative coverage

## Failure and freshness behavior

### Derivation failure

If the LLM call fails or returns invalid output:

- log the failure
- keep the previous `swot` entity unchanged
- do not overwrite with partial or empty content
- let the next natural trigger retry

No automatic retry loop in v1.

### First run

If no `swot` entity exists yet:

- the widget's **data provider** triggers a one-shot derive job
- the widget renders a muted placeholder such as `generating assessment…`
- no polling loop; refresh shows the result later
- repeated widget reads should not enqueue duplicate jobs while a derive is already pending

Important: this trigger belongs in the plugin-side data provider, not in the renderer itself.

The first-run path should enqueue the same `swot:derive` job used by event-driven updates, just with a different reason like `initial-missing-entity` for logging/debug.

## Dashboard presentation

### Placement

SWOT is no longer a standalone dashboard card. It now appears as the **Overview** tab inside the Agent Network widget.

### Renderer reality

The `swot` plugin still owns derivation and the reusable `SwotWidget` component, but the dashboard no longer renders it as its own card. Instead, the Agent Network widget imports and renders that component in its Overview tab.

### Shape

Use the SWOT portion of `docs/design/agent-network-widget-mockup.html` as the visual reference.

Rendering rules:

- title: `SWOT`
- fixed 2×2 grid
- Fraunces-italic quadrant labels with inline colored dots
- each item renders as `<b>{title}</b>` plus optional ` — {detail}`
- empty quadrant renders muted `—`
- grid shape should remain visible even when one quadrant is sparse

### Data handoff

The Agent Network widget reads `entityService.getEntity("swot", "swot")` alongside agents and skills.

If present:

- parse and return quadrant arrays for rendering in the Overview tab

If missing:

- render placeholder state in Overview
- rely on the `swot` plugin lifecycle to enqueue first-run derivation once initial sync completes

The Agent Network widget does no analysis itself.

## Relation to the agent-network widget

The Agent Network widget is now the presentation surface for SWOT.

- **SWOT plugin** = analytical summary derivation + durable `swot` entity
- **Agent Network widget** = operator surface with `Overview / Agents / Skills`

So the presentation is unified, while the plugin/data boundary remains separate.

## Order of work

1. Create `entities/swot/` package scaffolding.
2. Add schema + adapter for the durable single-entity shape.
3. Implement the deterministic context builder over `agent` + `skill` entities.
4. Implement the derive job: context build → structured LLM synthesis → upsert `swot`.
5. Gate event-driven derivation on `sync:initial:completed`, then subscribe to `agent` / `skill` lifecycle events and debounce job enqueueing.
6. Reuse `SwotWidget` inside the Agent Network widget Overview tab.
7. Move first-run missing-entity behavior into the `swot` plugin lifecycle, including duplicate-enqueue protection.
8. Test:
   - context builder over fixture data
   - debounce coalescing
   - one queued/running derive job suppresses duplicates
   - approved vs discovered semantics
   - failure preserves previous entity
   - single-entity upsert semantics (`id: "swot"` only)
   - first-run triggers derivation
   - first-run / repeated reads do not enqueue duplicate derive jobs
   - no derive before initial sync completes
   - widget registration happens via `system:plugins:ready`
9. Verify visually against the mockup.

## Follow-up / deferred

- staleness indicator (`derived 4h ago`)
- manual re-derive command
- richer grounding from topics or recent content
- factoring out a reusable analytical-entity pattern if a second real consumer appears
