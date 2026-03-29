# Plan: Content Insights

## Context

Brains generate and manage lots of content but have no self-awareness about it. "What do I write about most?" "When was I most productive?" "Which topics are underserved?" — the agent can answer these by querying entities, but there's no structured analysis, no trends, no dashboard.

The analytics plugin only tracks Cloudflare page views (external). This plan is about internal content analysis.

## What it answers

- **Topic distribution** — what do I write about? Weighted by entity count, recency, depth.
- **Content gaps** — topics mentioned but never developed into posts. Links saved but never referenced.
- **Publishing cadence** — how often do I publish? Trends over time. Dry spells.
- **Content health** — drafts that never shipped. Old posts that could be refreshed. Series with missing entries.
- **Cross-entity connections** — which posts link to which topics? How connected is the knowledge graph?
- **Generation stats** — how much content was AI-generated vs manually created? Quality scores from evals.

## Design

### Two layers

**1. Insights tool** — `system_insights` tool the agent can call. Returns structured analysis. The agent can answer natural language questions about content.

```
User: "What are my most common topics?"
Agent: calls system_insights → gets topic distribution → summarizes
```

**2. Dashboard widget** — visual content insights on the dashboard page. Client-side hydrated widget (like existing dashboard widgets). Shows charts/stats at a glance.

### Insights tool

```typescript
system_insights({
  type: "topic-distribution"    // → { topic, count, lastUsed }[]
  type: "publishing-cadence"    // → { month, entityType, count }[]
  type: "content-health"        // → { stale, drafts, incomplete }
  type: "overview"              // → all of the above, summarized
})
```

Built on entity service queries — no new data storage. Just aggregation of existing entity metadata (created dates, topics, entity types, status).

### Dashboard widget

A `ContentInsightsWidget` registered by a new `content-insights` plugin (or by the dashboard plugin itself). Shows:

- Topic cloud or bar chart
- Publishing timeline
- Content health summary (drafts, stale posts)

Uses the dashboard's existing hydration system for client-side interactivity.

## Steps

### Phase 1: Insights tool

1. Add `system_insights` tool to system tools
2. Implement queries: topic distribution, publishing cadence, content health
3. Agent can answer content analysis questions
4. Tests

### Phase 2: Dashboard widget

1. Create content insights dashboard widget
2. Register via dashboard plugin's widget messaging
3. Client-side chart rendering (simple bar charts, no charting library — SVG or CSS)
4. Tests

## Files affected

| Phase | Files | Nature                                  |
| ----- | ----- | --------------------------------------- |
| 1     | ~3    | System tool, insight queries            |
| 2     | ~5    | Widget component, registration, styling |

## Verification

1. "What are my most common topics?" → agent calls insights tool, gives structured answer
2. "How often do I publish?" → agent shows cadence trends
3. Dashboard shows topic distribution and content health at a glance
