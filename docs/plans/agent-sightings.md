# Plan: Agent sightings — second-order discovery

## Status

Implemented in `work/agent-sightings`. Sightings are discovered agents with provenance; they chart on the proximity map at half light, brains serve a public approved-agent directory over A2A, and `agent_scan_directories` crawls peers' directories into sightings. Promotion needs no new code: `agent_connect` already approves a discovered agent. Ready to merge.

## Context

The proximity map (shipped, `agent-proximity-map` plan retired) shows only first-order agents — retrospective by definition. Sightings are second-order agents reported by connected peers' directories: the one category on the map that tells the operator something they don't already know, and the path to the map being a discovery surface rather than a status display.

Settled decisions:

- **Radius stays semantic — order is light and routing.** Hop count renders as light decay (2nd order at half light) and thread routing: a sighting's threads grow from the introducing first-order agents, never from the center. Multiple introducers branch from each.
- **Semantic pruning.** Only sightings within `SIGHTING_GERMINATION_DISTANCE` (0.5 cosine) of the brain germinate onto the map — the rhizome grows toward nutrients. And only when at least one introducer is an active node: a thread has to grow from somewhere.
- **Sightings are agents, not a separate entity type.** Revisited and reversed from the original plan: a sighting is an `agent` entity with `status: discovered` plus provenance frontmatter (`introducedBy[]`, `hops`). The system already models "known but unvetted" as the `discovered` status (ATProto discovery), the crawl verifies each pointee's own card first-hand, and every agent consumer already filters by status — so the separate type bought fail-safety we already had, at the cost of a parallel schema/adapter and a bespoke promotion step. The map classifies second-order by `status === "discovered" && introducedBy.length > 0`.
- **The peer only vouches existence.** Directory entries are minimal `{name, url}` pointers; the sighting's content comes from the pointee's own Agent Card. Agents known first-hand never gain provenance from peer reports.
- **Promotion = approval.** `agent_connect` refetches the card and rebuilds the agent as approved, which drops the provenance — correct, since it is then first-order. On the map the same light moves from half to full.
- **Transport is a stopgap.** The A2A directory endpoint is fleet-internal plumbing; ATProto connection records are the preferred long-term substrate per [atproto-integration.md](./atproto-integration.md). Only the polling gets replaced — provenance, charting, and promotion stay identical.

## Shipped

- `agent` frontmatter carries optional `introducedBy`/`hops`; `buildAgentFromCard` accepts provenance.
- `buildProximityMapData` partitions sighted from first-order agents, prunes by germination distance and routable introducers, and charts sightings with tags derived from skills (symmetric with agent nodes).
- `GET /.well-known/agent-directory.json` on the A2A interface: approved + publicly visible agents as `{name, url}` pointers, built per request so approvals/archivals reflect live.
- `agent_scan_directories` (trusted, external): aggregates all approved peers' directories, then per unknown domain fetches its own card and creates a public discovered agent with provenance. Self and known agents skipped; repeat sightings merge introducers without refetching cards; unreachable peers and cardless entries tolerated and counted.

## Validation

- `bun test` in `entities/agent-discovery` and `interfaces/a2a`; lint via root wrapper; typecheck.
- Manual: hand-written discovered agent with `introducedBy` appears dim on the console map, routed through its introducer; hover keeps the introducer lit; `agent_connect` approval moves it to a full node.
