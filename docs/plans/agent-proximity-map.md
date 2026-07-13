# Plan: Agent proximity map

## Status

P2, implemented on `main`; only the changeset release remains. The interactive console map shipped in `0.2.0-alpha.161`; the composable website element is merged with its changeset pending. This does not preempt the P0 release candidate or P1 identity/model/Rizom lanes. Mockup at [agent-proximity-map-mockup.html](./agent-proximity-map-mockup.html) (open in a browser); delete it together with this plan after the website element ships.

## Context

The agent-discovery entity plugin has historically rendered agents as lists (dashboard "Agent Network" widget, `agent-list`/`agent-detail` site templates). The console now also projects agent and `brain-character` embeddings into an interactive radial proximity map through the private semantic index; the remaining work makes that map available as a website element.

This plan adds a **proximity map**: a radial visualization with the brain at the center and every saved agent placed by embedding distance, with semantic clusters circled and labeled. It ships as both a console dashboard widget and a site template ("website element"), rendered by one shared Preact SVG component.

## Design

### Decisions (settled)

- **Radial layout, not a 2D scatter (UMAP/t-SNE).** "Proximity to me" is the core semantic; a radial layout makes the one number that matters — distance to the brain — exactly readable as radius. A full 2D embedding projection makes _no_ axis readable and needs a heavy dependency.
  - _Radius_ = cosine distance between agent embedding and the `brain-character` embedding, normalized.
  - _Bearing_ = angle from the first two principal components of the agent embedding matrix (PCA via Gram-matrix power iteration — N agents, so the N×N Gram matrix is cheap regardless of the 1536-dim vectors). Similar agents therefore share a heading, which makes clusters visually contiguous.
- **No new dependencies.** Entity-service owns cosine distance and power-iteration PCA; agent-discovery owns single-link clustering and labels. Both are pure TypeScript, fully unit-testable, and deterministic — site builds must not jitter between runs. No d3/umap-js; SVG is server-rendered by Preact like every other template, with a vanilla client script for hover/highlight (the repo has no hydration framework by design).
- **Clustering in embedding space, not layout space.** The semantic projection returns neighbor relationships computed from cosine distance in the original embedding space. Agent-discovery finds connected components at a fixed threshold (0.25, tuned against the live Rover network; constant in one place), minimum cluster size 2. Cluster hulls are drawn around member _positions_; labels come from the members' most frequent skill tags (falling back to "unknown · N"). Tagged constellations sort first; unknown constellations sort last. Deterministic, no LLM call at render time.
- **Raw embeddings stay private to entity-service.** Plugins use the provider-independent `context.semantic.project()` namespace. The public contract returns entity references, origin distances, PCA coordinates, and optional neighbor relationships — never vectors, dimensions, or embedding-provider details.
- **Center fallback.** If `brain-character` has no visible embedding yet, semantic projection uses the centroid of agent embeddings and the UI says so ("identity not indexed yet"). Agents without embeddings are excluded from the map and surfaced as a count ("N pending indexing") rather than mis-placed.
- **Lifecycle remains visible.** Approved agents glow, discovered agents use review-state outlines, and archived agents decay to the faintest dashed trail and remnant point. Archived agents remain as history but are excluded from constellations, the constellation index, active reach counts, and skill aggregation.

### New semantic API

```ts
context.semantic.project({
  types: ["agent"],
  origin: { entityId: "brain-character", entityType: "brain-character" },
  maxNeighborDistance: 0.25,
  visibilityScope, // fail-closed: undefined → public only
});
// → { origin, points[{entityId, entityType, coordinates, distanceToOrigin}], neighbors, distanceRange }
```

Internally, `EntitySearch.projectSemanticSpace()` joins visible entities to the attached embedding database, decodes vectors, computes cosine distances and deterministic two-component PCA, then discards the vectors. `createBasePluginContext()` exposes only the narrow `semantic.project()` facade; raw embedding access is not part of the plugin-facing `IEntityService`.

### Data flow

```
agent entities + brain-character ──(async embedding jobs, already shipped)──▶ emb.embeddings
                                                                                   │
lib/proximity-map-data.ts: buildProximityMapData(entityService, semantic)           │
  listEntities(agent) + semantic.project({types: [agent], origin: brain-character}) ◀┘
  → lib/proximity-map.ts: radius normalization, constellations, tag labels
  → ProximityMapData { center, nodes[{id,name,kind,status,tags,distance,bearing}], clusters[{label,memberIds,links}], distanceRange, pendingCount }
        │                                        │
        ▼                                        ▼
dashboard widget (agent-dashboard.ts)      ProximityMapDataSource → agent-proximity-map template
        └────────────── shared Preact SVG component (widgets/proximity-map.tsx) ──────────────┘
```

Pixel positions are computed by the component from `distance`/`bearing`, so the data schema stays presentation-free.

### Files

- `shell/entity-service`: `src/entity-search.ts`, `src/entityService.ts`, `src/semantic-space.ts`, `src/types.ts` (+ `test/project-semantic-space.test.ts`)
- `shell/plugins`: `src/base/context.ts`, `src/public/types.ts` (+ `test/semantic-context.test.ts`)
- `entities/agent-discovery`:
  - `src/lib/proximity-map.ts` — radius normalization, clustering, and labels
  - `src/lib/proximity-map-schema.ts` — zod schema for `ProximityMapData`
  - `src/lib/proximity-map-data.ts` — `buildProximityMapData(entityService, semantic)`
  - `src/widgets/proximity-map.tsx` + `proximity-map-script.ts` — shared SVG component, widget wrapper, hover script
  - `src/datasources/proximity-map-datasource.ts` — datasource for the site template
  - `src/lib/agent-dashboard.ts`, `src/lib/register-templates.ts`, `src/plugins/agent-plugin.ts`, `src/lib/constants.ts` — wiring
  - mirrored tests under `test/`

## Phases

### Phase 1 — website element — implemented

`ProximityMapDataSource` (id in `constants.ts`, fetch → `buildProximityMapData`) + `agent-proximity-map` template (`requiredPermission: "public"`, shared component, tooltip script via `runtimeScripts`) are wired through `agent-plugin.ts`. The shared SVG now has a paper site climate with editorial copy, live network statistics, responsive layout, archived traces, and the existing agent-directory CTA. Datasource, deterministic rendering, template registration, runtime-script interaction, responsive visual output, tests, typecheck, and lint are validated. The template is available to any site composition; no site is rewired in this plan.

**Ships:** the map as a composable site section.

### Phase 2 — beyond first order (parked)

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

- `bun test` in `shell/entity-service`, `shell/plugins`, and `entities/agent-discovery`; lint via `bun scripts/lint.mjs --force --filter …`; typecheck.
- Manual: console dashboard shows the widget with live agents; site build renders the template; map is byte-identical across two consecutive builds (determinism).
