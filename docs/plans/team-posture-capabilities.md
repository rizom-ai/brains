# Plan: Team-Posture Capabilities

Last updated: 2026-06-23

## Status

Parked — demand-gated. The `team` bundle ([brain-model-unification.md](./brain-model-unification.md)) ships the collaboration _substrate_ (conversation-memory `shared`, docs, the trusted-collaborator permission posture). This plan tracks the team-**native** capabilities that would make the collective posture distinctive — more than "the personal posture minus publishing." None are required for the current POC; build each when real team usage forces it. Extracted from the retired `relay-presets.md` (its preset/tier mechanics were superseded by the bundle model).

## Context

A team brain that only captures notes/links and summarizes conversations is "rover minus the personal stuff." To differentiate, the collective posture needs artifacts and workflows that are _inherently_ about multiple people co-authoring understanding. These are deferred deliberately: each should be designed as a dedicated plugin with a Brains-native shape, not by reusing the publishing/newsletter stack.

These capabilities assume the §3 trust/identity substrate ([multi-user.md](./multi-user.md)) for real per-person attribution; until that lands they operate on the single-anchor + trusted-collaborator model.

## Distinctive capabilities (prioritized)

If the goal is to make the collective posture stand on its own, this is the order that buys differentiation fastest:

1. **`meeting-notes`** — capture and structure meeting transcripts. The most concrete "team" artifact after basic notes.
2. **`decision-record`** — ADR-style decision logs with rationale. A core team artifact; pairs naturally with conversation-memory's existing `decision` projection.
3. **`rag-qa`** — conversational Q&A over the brain ("ask the team"). Arguably the single most valuable thing a team brain does.
4. **`team-digest`** — scheduled "what the team did this week" rollup. Needs a Relay-native product shape _before_ reusing the existing content-pipeline/newsletter machinery.

Second tier, clearly team-shaped but heavier or less proven:

- **`knowledge-graph`** — visualize entity connections; a discovery aid for large knowledge bases.
- **`shared-drafts`** — live collaborative editing on entities. Hard, but very team-shaped.
- **`task-tracker`** — lightweight team tasks, only if it stays entity-shaped rather than becoming a project-management app.

## Source integrations (deferred)

Team source bridges worth adding once the import/sync UX is scoped — read-only bridges first:

- **`obsidian-vault`** — power-user import/sync (an opt-in ergonomic layer).
- **`notion`** — useful team source integration; scope the read-only bridge UX first. (The earlier `plugins/notion` MCP bridge and its `shared/mcp-bridge` base were deleted as dead code; recover from git history if useful.)
- **`hackmd`** — collaborative-doc import bridge; not required for the first POC loop. (The earlier `plugins/hackmd` bridge was likewise deleted; recover from git history if useful.)

## Open design questions

- **Content-entity nav/route policy.** `docs` and `decks` already add public routes; future team types (decision records, meeting notes, digests) need explicit nav/route policy instead of inheriting the publishing posture's assumptions.
- **`team-digest` product shape.** Define it as a team-specific surface before reaching for the publishing/newsletter stack — otherwise it collapses back into "rover minus the personal stuff."

## Related plans

- [brain-model-unification.md](./brain-model-unification.md) — defines the `team` bundle these capabilities extend.
- [multi-user.md](./multi-user.md) — the per-person identity substrate real team attribution depends on.
