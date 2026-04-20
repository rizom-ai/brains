# Plan: Agent Network widget

Last updated: 2026-04-20

## Goal

Replace the two status-framed agent-discovery widgets (`directory-summary`, `recent-discoveries`) with one combined widget that presents three internal views on an agent-directory capability-coverage graph: an analytical Overview (SWOT), an Agents list (kind-filtered), and a Skills inventory (tag-filtered).

The widget is primarily an operator surface and secondarily audience-facing — a "cast of characters" portrait with actionable signals.

## Why

The existing widgets answer "what status are my agents in?" — a framing the next pass of agent-discovery work explicitly moves away from. We want the dashboard surface to answer:

- what does my network look like? (identity / composition)
- what can it do? (capability inventory)
- where are the risks and gaps? (derived analysis)

Three separate widgets would restore the fragmentation we're trying to eliminate. One widget with three lenses keeps the surface tight and lets all three views read from a single computation.

## Scope

### In scope

1. new combined dashboard widget with three internal views (Overview / Agents / Skills)
2. new shared primitive: `entities/agent-discovery/src/lib/coverage.ts`
3. new helper for agent-directory tag vocabulary priming: `entities/agent-discovery/src/lib/tag-vocabulary.ts`
4. prompt updates in `skill-deriver` and `AgentGenerationJobHandler` to consume the agent-directory vocabulary primer
5. delete the two existing registrations in `entities/agent-discovery/src/plugin.ts`
6. design mockup at `docs/design/agent-network-widget-mockup.html` (already landed, iterate as reference)

### Out of scope

- sidebar `Skills` widget in `entities/agent-discovery/src/plugins/skill-plugin.ts` — stays as-is (identity purpose: brain's A2A-advertised capabilities alongside Character)
- new entity types (no `tag`, no `coverage-edge`)
- schema changes on `agent` or `skill` entities
- cross-brain federation of tag registries or any repo-wide tag system
- per-row click-through / backlinking from SWOT items to specific agents
- inline approve action on review pills (behavioral, sketch-only for now)
- keyboard navigation between tabs

## Widget shape

One registration on the dashboard, one renderer, one data provider.

### Placement

- `section: "secondary"`
- replaces `directory-summary` (priority 15) and `recent-discoveries` (priority 16)
- single priority (15 or similar), replacing both
- `rendererName: "AgentNetworkWidget"` — new renderer modeled on `PipelineWidget`'s tab/panel pattern

### Three internal views

**View toggle (primary tab bar):** `Overview · Agents · Skills`. Default: Overview.

**Kind filter (secondary tab bar):** `all · professional · team · collective`. Visible only inside the Agents view.

**Tag filter (tertiary, inside Skills view):** a pipeline-pattern row of tag filter buttons. `all` is default. Shows only the tags that carry signal — top-count multi-source tags plus any gap tag (brain-only).

### Overview content

SWOT 2×2 with a subtle cross divider. Each quadrant has a colored dot anchored inline with the Fraunces-italic category label, then 2–4 short derived items.

SWOT cells are **derived**, not authored. No backlinking to specific agents — items can reference capability areas or counts, but not agent-level clickable links. The specifics live in the other two tabs where they are navigable.

### Agents content

Kind-tabbed list of agent rows (name, short description, skill tags, `review` pill only on `discovered` agents). Sort by `skills.length` desc, tiebreak `discoveredAt` desc. Max 8 per kind, scrollable beyond.

### Skills content

Flat list of all unique skills from the brain + saved agents. Each row: skill name + source chip (brain uses accent color; agents use brainName). Tag filter buttons at top drive row visibility via `data-tags` attribute.

Both Agents and Skills lists have `max-height: 320px` with a thin vertical scrollbar styled to the dashboard palette.

## Shared primitive: `coverage.ts`

Location: `entities/agent-discovery/src/lib/coverage.ts`

Computed in memory over current `agent` + `skill` entities every time the widget renders. No stored graph, no schema change, no invalidation discipline needed at personal-directory scale. Tag aggregation is local to agent-discovery data only; it does not depend on tags from other entity types.

API shape (rough):

```ts
interface Coverage {
  summary: {
    totalAgents: number; // count of saved agents
    totalSkills: number; // count of unique skills across brain + agents
    totalTags: number; // count of unique tags across the corpus
    gapTags: string[]; // tags only the brain carries (no external coverage)
    reviewCount: number; // agents with status "discovered"
    coveredByKind: Record<"professional" | "team" | "collective", number>;
  };
  swot: {
    strengths: SwotItem[]; // multi-source tags, high-coverage fractions
    weaknesses: SwotItem[]; // gaps, single-source skills
    opportunities: SwotItem[]; // tag clusters present on agents but absent from brain
    threats: SwotItem[]; // pending-review count, no-redundancy count
  };
  agents: Map<AgentKind | "all", AgentRow[]>;
  skills: SkillRow[]; // flat, each skill once
  tagsByCount: Array<{
    tag: string;
    count: number;
    kind: "strong" | "gap" | "extension" | "normal";
  }>;
}
```

`AgentRow` carries just what the widget needs (name, description, tags, status). `SkillRow` carries skill name, source (brainName or "brain"), and the skill's own `tags[]` for client-side filtering.

### SWOT derivation rules

No LLM involved. Simple aggregations:

- **Strengths** — tags with ≥ N sources (N = 2 or 3 depending on network size); fraction of local skills with external coverage if > 50%.
- **Weaknesses** — local skills with 0 external sources (gaps); local skills with exactly 1 external source (single-source risk).
- **Opportunities** — tags present on agents but absent from brain (extensions), rolled up into a single item with a count and an inline list of area labels.
- **Threats** — count of `discovered` agents awaiting review; count of local skills with no redundancy.

Each cell renders top 2–3 items by magnitude. Cells stay present when empty with a muted `—` rather than collapsing, so the 2×2 grid always reads as SWOT.

## Agent-directory-local tag normalization

The widget still depends on a coherent tag vocabulary so that SWOT counts and the Skills tag filter aggregate correctly. Without it, `research` / `Research` / `academic-research` fragment source counts and the widget's numbers are misleading.

But this should stay local to agent discovery. No repo-wide tag contract, no `EntityPlugin.getTags`, and no rollout across unrelated entities.

Scope the vocabulary helper to the agent directory only:

- local brain skills derived in `entities/agent-discovery/src/lib/skill-deriver.ts`
- saved/discovered agents ingested in `entities/agent-discovery/src/handlers/agent-generation-handler.ts`
- any coverage aggregation used by this widget

Both generators gain the primer block in their LLM prompts, but they read from an agent-directory-local vocabulary built from existing `agent` and `skill` entities only.

## Data flow at widget render

1. widget `dataProvider` calls `coverage.ts` → gets the `Coverage` object
2. renderer emits HTML for all three view panels in one pass
3. `data-view` and `data-tag-filter` attributes drive client-side toggling (no re-fetch per tab click)
4. panel switches are instant; no server round-trip

## Order of work

1. Add agent-directory-local `tag-vocabulary.ts` helper and wire its primer into `skill-deriver` and `AgentGenerationJobHandler`.
2. Add `coverage.ts` primitive. Unit-test the derivation rules over fixture data.
3. Add `AgentNetworkWidget` renderer. Model on `PipelineWidget` code and CSS.
4. Register the new widget in `entities/agent-discovery/src/plugin.ts`. Delete the two existing registrations in the same commit.
5. Verify visually against the mockup at `docs/design/agent-network-widget-mockup.html`.

## Follow-up / deferred

- **Inline approve on review pill.** Requires dashboard → tool-call wiring that doesn't exist yet. Useful but a separate concern.
- **Click-through from Skills or Agents rows to entity detail pages.** Requires href generation and navigation plumbing.
- **Keyboard navigation between view tabs and within lists.**
- **Larger networks (>30 agents).** At that scale, Agents view needs search or virtualization; Skills tag filter may need grouping. Re-evaluate if/when it becomes relevant.
- **SWOT cell click-through to the specifics that generated the item.** Rejected for now — specifics live in the other tabs and SWOT stays analytical.

## Out-of-scope considerations revisited

- **Cross-brain federation of tags:** out of scope. This plan is only about one brain's agent directory and its local skill/agent tags.
- **Trust / relationship tiers on agents:** tracked separately by `docs/plans/agent-discovery.md`, out of this plan.
- **Extensions as a first-class surface:** collapsed into SWOT Opportunities. If operators want more detail, they scan Skills tab filtered by the relevant tag.
