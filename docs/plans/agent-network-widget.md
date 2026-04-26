# Plan: Agent Network widget

Last updated: 2026-04-26

## Status

The combined Agent Network widget has landed.

It replaces the earlier status-framed agent-discovery widgets with one dashboard surface over three views:

- **Overview** — SWOT summary from the `swot` entity maintained by the assessment package
- **Agents** — saved agent directory entries, including discovered/review state where relevant
- **Skills** — skill inventory and tag-filtered capabilities across the brain and saved agents

The current package boundary is:

```text
entities/agent-discovery
  owns agent contacts, remote agent-card ingestion, approval state, and skill evidence

entities/assessment
  owns interpretation outputs such as SWOT
```

The widget can render SWOT-derived overview data, but SWOT derivation/storage no longer belongs to agent-discovery.

## Landed implementation

- `entities/agent-discovery/src/lib/tag-vocabulary.ts` normalizes agent-directory-local tags.
- `AgentGenerationJobHandler` normalizes declared Agent Card tags on write.
- `skill-deriver` gets an agent-directory tag vocabulary primer so generated tags reuse existing vocabulary when appropriate.
- `AgentNetworkWidget` is registered as the dashboard widget renderer.
- The old `directory-summary` and `recent-discoveries` widget registrations are replaced by the combined widget.
- Widget data is built from existing `agent`, `skill`, and `swot` entities without new durable entity types.

## Follow-up / deferred

- **Inline approve on review pill.** Requires dashboard → tool-call wiring that does not exist yet.
- **Click-through from Skills or Agents rows to entity detail pages.** Requires href generation and navigation plumbing.
- **Keyboard navigation between view tabs and within lists.**
- **Larger networks (>30 agents).** At that scale, Agents view needs search or virtualization; Skills tag filter may need grouping.
- **Widget-level cross-linking between Skills and Overview.** The unified widget could eventually share hover/selection state across tabs. Defer until richer client behavior ships.

## Non-goals

- Moving SWOT back into agent-discovery.
- A repo-wide tag vocabulary or `EntityPlugin.getTags` contract.
- New entity types for the widget.
- Inline management tools unless normal CRUD/dashboard wiring proves insufficient.

## Done when

This plan can be deleted once the deferred UX items either move into narrower plans or are explicitly dropped.
