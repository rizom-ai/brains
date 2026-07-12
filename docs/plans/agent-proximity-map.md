# Plan: Agent proximity map

## Status

P2, not started. This does not preempt the P0 release candidate or P1 identity/model/Rizom lanes. Mockup at [agent-proximity-map-mockup.html](./agent-proximity-map-mockup.html) (open in a browser); delete it together with this plan when the feature ships.

## Context

The agent-discovery entity plugin renders agents as lists (dashboard "Agent Network" widget, `agent-list`/`agent-detail` site templates). None of these show _how the network relates to the brain semantically_. Every agent and the brain's own identity (`brain-character`) already get embeddings stored in the embedding DB (`embeddings` table, `F32_BLOB`, attached to the entity DB as `emb`) — but nothing reads raw vectors today; they only power search.

This plan adds a **proximity map**: a radial visualization with the brain at the center and every discovered agent placed by embedding distance, with semantic clusters circled and labeled. It ships as both a console dashboard widget and a site template ("website element"), rendered by one shared Preact SVG component.

## Design

### Decisions (settled)

- **Radial layout, not a 2D scatter (UMAP/t-SNE).** "Proximity to me" is the core semantic; a radial layout makes the one number that matters — distance to the brain — exactly readable as radius. A full 2D embedding projection makes _no_ axis readable and needs a heavy dependency.
  - _Radius_ = cosine distance between agent embedding and the `brain-character` embedding, normalized.
  - _Bearing_ = angle from the first two principal components of the agent embedding matrix (PCA via Gram-matrix power iteration — N agents, so the N×N Gram matrix is cheap regardless of the 1536-dim vectors). Similar agents therefore share a heading, which makes clusters visually contiguous.
- **No new dependencies.** The math (cosine distance, power-iteration PCA, single-link clustering) is ~150 lines of pure TS in the entity package, fully unit-testable and deterministic — site builds must not jitter between runs. No d3/umap-js; SVG is server-rendered by Preact like every other template, with a vanilla client script for hover/highlight (the repo has no hydration framework by design).
- **Clustering in embedding space, not layout space.** Single-link agglomerative clustering with a fixed cosine-distance threshold (start at 0.4; constant in one place), minimum cluster size 2. Cluster hulls are drawn as circles around member _positions_; labels come from the members' most frequent skill tags (falling back to "cluster of N"). Deterministic, no LLM call at render time.
- **Embedding access is a new read-only core API, not raw SQL in the plugin.** Plugins see `IEntityService` (a `Pick` of `ICoreEntityService`); datasources get the same interface. We add one method and expose it through the pick list — no plugin ever touches the embedding DB directly.
- **Center fallback.** If `brain-character` has no embedding yet, center on the centroid of agent embeddings and say so in the UI ("identity not indexed yet"). Agents without embeddings are excluded from the map and surfaced as a count ("N pending indexing") rather than mis-placed.

### New core API

```ts
// shell/entity-service (ICoreEntityService + EntitySearch impl)
getEmbeddings(request: {
  types?: string[];                    // filter by entity type
  visibilityScope?: ContentVisibility; // fail-closed: undefined → public only (same as search)
}): Promise<Array<{ entityId: string; entityType: string; embedding: Float32Array }>>
```

Implemented in `EntitySearch` (it already owns the attached-`emb` join used by `search`/`searchWithDistances`): join `entities` ↔ `emb.embeddings`, apply the same visibility conditions, decode the blob to `Float32Array`. Exposed to plugins by adding `"getEmbeddings"` to `PublicEntityServiceMethods` in `shell/plugins/src/public/types.ts`.

### Data flow

```
agent entities + brain-character ──(async embedding jobs, already shipped)──▶ emb.embeddings
                                                                                   │
lib/proximity-map-data.ts: buildProximityMapData(entityService)                    │
  listEntities(agent) + getEmbeddings({types: [agent, brain-character]}) ◀─────────┘
  → lib/proximity-map.ts: distances, PCA bearings, clusters, tag labels
  → ProximityMapData { center, nodes[{id,name,kind,status,tags,distance,bearing}], clusters[{label,memberIds}], pendingCount }
        │                                        │
        ▼                                        ▼
dashboard widget (agent-dashboard.ts)      ProximityMapDataSource → agent-proximity-map template
        └────────────── shared Preact SVG component (widgets/proximity-map.tsx) ──────────────┘
```

Pixel positions are computed by the component from `distance`/`bearing`, so the data schema stays presentation-free.

### Files

- `shell/entity-service`: `src/entity-search.ts`, `src/entityService.ts`, `src/types.ts` (+ `test/get-embeddings.test.ts`)
- `shell/plugins`: `src/public/types.ts` (pick-list addition)
- `entities/agent-discovery`:
  - `src/lib/proximity-map.ts` — pure math (distances, PCA bearings, clustering, labels)
  - `src/lib/proximity-map-schema.ts` — zod schema for `ProximityMapData`
  - `src/lib/proximity-map-data.ts` — `buildProximityMapData(entityService)`
  - `src/widgets/proximity-map.tsx` + `proximity-map-script.ts` — shared SVG component, widget wrapper, hover script
  - `src/datasources/proximity-map-datasource.ts` — datasource for the site template
  - `src/lib/agent-dashboard.ts`, `src/lib/register-templates.ts`, `src/plugins/agent-plugin.ts`, `src/lib/constants.ts` — wiring
  - mirrored tests under `test/`

## Phases

Thin vertical slices; each phase lands tests with its implementation and leaves the tree shippable.

### Phase 1 — walking skeleton: distance-only map in the console

Tests first at every step.

1. `getEmbeddings` in entity-service (integration tests on the real test DB: returns typed vectors, type filter, fail-closed visibility) + expose through the plugins pick list.
2. `lib/proximity-map.ts` v1: cosine distance + radius normalization; bearings by golden-angle sequence over distance rank (deterministic placeholder, no PCA yet).
3. `buildProximityMapData` + zod schema (mock entityService tests: happy path, missing center → centroid fallback, agents without embeddings → `pendingCount`).
4. Shared SVG component (render tests via `preact-render-to-string`: rings, center, nodes, empty state) registered as a second dashboard widget ("Agent Proximity", digest: agents/clusters/pending).

**Ships:** a real, honest distance map in the console.

### Phase 2 — semantic bearings

PCA over agent embeddings (Gram matrix + power iteration with deflation, fixed seed vector) → `bearing = atan2(pc2, pc1)`. Unit tests with synthetic vector families asserting: similar vectors get nearby bearings, dissimilar ones don't, output is deterministic, degenerate cases (0, 1, 2 agents; identical vectors) don't NaN.

**Ships:** direction on the map now means something; visual grouping emerges.

### Phase 3 — clusters and interactivity

Single-link threshold clustering in embedding space (min size 2), hull circles + tag-derived labels in the component, hover tooltip/highlight client script (mirrors `agent-network-widget-script.ts` conventions: data attributes + vanilla listeners). Tests: clustering unit tests (threshold behavior, label derivation from skill tags, tie-breaking determinism), component render test for hulls/labels.

**Ships:** the "mark/circle/label clusters" half of the feature, in the console.

### Phase 4 — website element

`ProximityMapDataSource` (id in `constants.ts`, fetch → `buildProximityMapData`) + `agent-proximity-map` template (`requiredPermission: "public"`, shared component, tooltip script via `runtimeScripts`). Wire into `agent-plugin.ts` `getDataSources`/`getTemplates`. Tests: datasource fetch against schema, template render test. The template is then available to any site composition; no site is rewired in this plan.

**Ships:** the map as a composable site section.

### Phase 5 — beyond first order (parked)

Parked until the peer-graph substrate exists; the calls are recorded here so they don't get re-litigated. The layout already generalizes: anything we can fetch a card for we can embed and place — order is a data-availability problem, not a layout problem. Two data paths, in preference order:

1. **ATProto connection records** (preferred). Agent entities already carry `brainDid`/`cardUri`; once brains publish their connections as repo records (the follows-graph shape [atproto-integration.md](./atproto-integration.md)'s discovery lane points at), 2nd/3rd order is walking public repos — no bilateral protocol, composes beyond the fleet.
2. **A2A directory convention** (fleet-internal stopgap). Expose a brain's public agent directory over the existing `a2aEndpoint`; one crawl hop per order.

Decisions:

- **Radius stays semantic — order is light and routing.** Hop count is topological, embedding distance is semantic; never conflate them on the same axis. Order renders as light decay (1st order full amber, 2nd dimmer, 3rd a spore — which also preserves the 15:85 darkness budget as population grows) and as **thread routing**: a 2nd-order agent's thread grows out of the introducing 1st-order agent, not out of the center; multiple introducers branch from each. You see whose roots reach them, and that you can't reach them directly yet.
- **Semantic pruning.** Only germinate 2nd/3rd-order nodes within a cosine-distance threshold of the center — fan-out explodes otherwise (12 agents × their dozens × theirs). The rhizome grows toward nutrients, not everywhere.
- **Sightings, not entities.** Hearsay agents become lightweight sighting records with provenance (`introducedBy[]`, hop count, card ref), not full agent entities; promote to a real entity on approval so the directory stays clean.
- **Product angle.** A dim bulb near the center with no thread from you is a discovery suggestion — semantically close, reachable through a named peer — which turns the map from a status display into the discovery surface itself.

The mockup already sketches this: two dim sightings, one routed through `kai.brain`, one branching from both `north.ops` and `forge.dev`.

## Validation

- `bun test` in `shell/entity-service` and `entities/agent-discovery`; lint via `bun scripts/lint.mjs --force --filter …`; typecheck.
- Manual: console dashboard shows the widget with live agents; site build renders the template; map is byte-identical across two consecutive builds (determinism).
