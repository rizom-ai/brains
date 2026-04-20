# Plan: Agent Network widget

Last updated: 2026-04-20

## Goal

Replace the two status-framed agent-discovery widgets (`directory-summary`, `recent-discoveries`) with one combined widget that presents three internal views of the agent directory: an **Overview** tab (SWOT summary), an **Agents** list (kind-filtered cast), and a **Skills** inventory (tag-filtered flat list).

The widget is primarily an operator surface and secondarily audience-facing — a "cast of characters" directory with clean capability browsing.

SWOT analysis remains a separate derivation/data concern tracked in `docs/plans/swot.md`, but from the operator’s point of view it now appears as the **Overview** tab inside this widget.

## Why

The existing widgets answer "what status are my agents in?" — a framing the next pass of agent-discovery work explicitly moves away from. The agent-network widget should answer:

- who's in my network? (Agents view)
- what does my network actually offer? (Skills view)

Two widgets today become one with two internal views. Net dashboard footprint goes down, not up.

## Scope

### In scope

1. new combined dashboard widget with three internal views (Overview / Agents / Skills)
2. agent-directory-local tag normalization helper at `entities/agent-discovery/src/lib/tag-vocabulary.ts`
3. prompt primer wired into `entities/agent-discovery/src/lib/skill-deriver.ts`
4. write-time `normalizeTags` in `AgentGenerationJobHandler` when ingesting Agent Card tags
5. delete the two existing registrations in `entities/agent-discovery/src/plugin.ts`
6. design mockup at `docs/design/agent-network-widget-mockup.html` (already landed — its Overview tab is now part of this widget again)

### Out of scope

- separate standalone SWOT dashboard card
- sidebar `Skills` widget in `entities/agent-discovery/src/plugins/skill-plugin.ts` — stays as-is (identity purpose: brain's A2A-advertised capabilities alongside Character)
- new entity types
- schema changes on `agent` or `skill` entities
- repo-wide tag vocabulary or `EntityPlugin.getTags` contract
- cross-brain federation of tag registries
- inline approve action on review pills (behavioral, sketch-only for now)
- keyboard navigation between tabs

## Widget shape

One registration on the dashboard, one plugin-owned Preact widget component, one data provider. SWOT stays separate at the data/derivation layer, but not as a separate dashboard card.

### Placement

- `section: "secondary"`
- priority: 15
- replaces `directory-summary` (priority 15) and `recent-discoveries` (priority 16)
- `rendererName: "AgentNetworkWidget"`
- `component: AgentNetworkWidget` registered by `entities/agent-discovery`
- optional `clientScript` registered alongside the component for tab/filter behavior

### Three internal views

**View toggle (primary tab bar):** `Overview · Agents · Skills`. Default: Overview.

**Kind filter (secondary tab bar):** `all · professional · team · collective`. Visible only inside the Agents view.

**Tag filter (inside Skills view):** a pipeline-pattern row of tag filter buttons. `all` is default. Shows only the tags that carry signal — top-count multi-source tags plus any gap tag (brain-only).

### Overview content

SWOT summary rendered as the opening lens on the network. The widget reuses the SWOT presentation component, but the data still comes from the `swot` entity maintained by the `swot` plugin.

### Agents content

Kind-tabbed list of agent rows (name, short description, skill tags, `review` pill only on `discovered` agents). Sort by `skills.length` desc, tiebreak `discoveredAt` desc. Max 8 per kind, scrollable beyond.

### Skills content

Flat list of all unique skills from the brain + saved agents. Each row: skill name + source chip (brain uses accent color; agents use brainName). Tag filter buttons at top drive row visibility via `data-tags` attribute.

Both lists have `max-height: 320px` with a thin vertical scrollbar styled to the dashboard palette.

## Agent-directory-local tag normalization

The Skills tab's tag filter depends on clean tag aggregation so that `research` / `Research` / `academic-research` don't fragment into separate filter buttons with split counts.

Scoped local to agent-discovery — no repo-wide `EntityPlugin.getTags`, no rollout across unrelated entities.

### Helper

`entities/agent-discovery/src/lib/tag-vocabulary.ts` exposes:

```ts
function normalizeTag(raw: string): string;
function normalizeTags(raw: string[]): string[];
async function collectTagVocabulary(
  context: EntityPluginContext,
  opts?: { minCount?: number; topN?: number },
): Promise<Array<{ tag: string; count: number }>>;
function formatVocabularyForPrompt(
  vocab: Array<{ tag: string; count: number }>,
): string;
```

`collectTagVocabulary` reads across the brain's `agent` and `skill` entities only. No other entity types are consulted.

### Normalization rules (v1, conservative)

Do:

- trim leading/trailing whitespace
- lowercase
- collapse repeated internal whitespace
- discard empty results
- dedupe within the same entity

Do not do:

- stemming
- plural-to-singular conversion
- synonym merging

Over-aggressive normalization produces false merges and makes debugging harder. Soft convergence comes from the primer, not from hand-maintained rules.

### Primer adopter

`entities/agent-discovery/src/lib/skill-deriver.ts` only. Its LLM prompt gains a section listing current agent-directory tag frequencies with "reuse existing tags where they fit" guidance.

`AgentGenerationJobHandler` does **not** get the primer — it doesn't LLM-generate tags, it parses Agent Cards verbatim. It does get write-time `normalizeTags` on declared Agent Card tags at ingestion (mechanical, no LLM), so stored tags are at least case/whitespace-clean from both sources.

## Data flow at widget render

1. widget `dataProvider` queries the entity service for `swot`, `agent`, and `skill` entities
2. normalizes tags via `normalizeTags` at read time for filter-button correctness
3. plugin-owned Preact widget renders all three view panels in one pass
4. plugin-owned `clientScript` drives `data-view` and `data-tag-filter` toggling — no re-fetch per tab click

No shared `coverage.ts` primitive — the two views are simple queries over existing entities. If a future surface (e.g., SWOT re-derivation, a third widget) wants shared aggregations, factor out then.

## Order of work

1. Add `tag-vocabulary.ts` helper (normalize, collect, format) in agent-discovery.
2. Wire primer into `skill-deriver`; add write-time `normalizeTags` in `AgentGenerationJobHandler`.
3. Add `AgentNetworkWidget` as a plugin-owned Preact component in `entities/agent-discovery/src/widgets/` and register its `clientScript`.
4. Register the new widget at `section: "secondary"`, `priority: 15`. Delete the two existing registrations in the same commit.
5. Verify visually against the Overview, Agents, and Skills tab areas of `docs/design/agent-network-widget-mockup.html`.

## Follow-up / deferred

- **Inline approve on review pill.** Requires dashboard → tool-call wiring that doesn't exist yet.
- **Click-through from Skills or Agents rows to entity detail pages.** Requires href generation and navigation plumbing.
- **Keyboard navigation between view tabs and within lists.**
- **Larger networks (>30 agents).** At that scale, Agents view needs search or virtualization; Skills tag filter may need grouping.
- **Widget-level cross-linking between Skills and Overview.** The unified widget could eventually share hover/selection state across tabs (hover a tag in Skills → highlight related SWOT items in Overview). Defer until richer client behavior ships.
