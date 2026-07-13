# Plan: Agent sightings — second-order discovery

## Status

In progress in `work/agent-sightings`. Slice 1 (walking skeleton) is implemented: the `agent-sighting` entity type exists, is embeddable, and germinated sightings render on the proximity map at half light, routed through their introducers. Slices 2–3 (A2A directory + crawl, promotion) remain.

## Context

The proximity map (shipped, `agent-proximity-map` plan retired) shows only first-order agents — retrospective by definition. Sightings are second-order agents reported by connected peers' directories: the one category on the map that tells the operator something they don't already know, and the path to the map being a discovery surface rather than a status display.

Decisions carried over from the retired plan, settled and not to be re-litigated:

- **Radius stays semantic — order is light and routing.** Hop count renders as light decay (2nd order at half light) and thread routing: a sighting's threads grow from the introducing first-order agents, never from the center. Multiple introducers branch from each.
- **Semantic pruning.** Only sightings within `SIGHTING_GERMINATION_DISTANCE` (0.5 cosine) of the brain germinate onto the map — the rhizome grows toward nutrients. And only when at least one introducer is an active node: a thread has to grow from somewhere.
- **Sightings, not agents.** `agent-sighting` is its own lightweight entity type with provenance (`introducedBy[]`, `hops`, `cardUri`, `sightedAt`); embeddable so semantic placement works. Promotion to a full `agent` entity happens on approval.
- **Product angle.** A near-center sighting is a discovery suggestion: semantically close, reachable through a named peer.

## Slices

### Slice 1 — walking skeleton — implemented

`agent-sighting` schema/adapter registered by the agent plugin via `context.entities.register` (no new plugin, no brain-composition changes). `buildProximityMapData` lists sightings, projects them through `semantic.project` alongside agents, prunes by germination distance and routable introducers. The shared component renders dim bulbs with threads from each visible introducer; hovering keeps the introducers lit and shows "second order · via …". Tests: adapter round-trip, data pruning/routing, component rendering, script interactions, plugin registration.

An operator can already hand-write a sighting markdown file (directory-sync) and see it on the live map once embedded.

### Slice 2 — A2A public directory + one-hop crawl

Expose a brain's public approved-agent directory over the existing `a2aEndpoint` (fleet-internal stopgap; ATProto connection records are the preferred long-term substrate per [atproto-integration.md](./atproto-integration.md)). A crawl tool/job walks each approved agent's directory and upserts sighting entities with provenance; re-sighting an already-connected agent is a no-op.

### Slice 3 — promotion

`agent_connect` (or a dedicated tool) promotes a sighting to a full agent entity: fetch card via `cardUri`/`url`, create the agent, archive or delete the sighting. The map then shows the same light moving from half to full — discovery closing the loop.

## Validation

- `bun test` in `entities/agent-discovery`; lint via root wrapper; typecheck.
- Manual: hand-written sighting appears dim on the console map, routed through its introducer; hover keeps the introducer lit.
