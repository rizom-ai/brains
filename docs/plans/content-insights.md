# Plan: Content Insights

## Context

Brains generate and manage lots of content but have no self-awareness about it. "What do I write about most?" "When was I most productive?" "Which topics are underserved?" — the agent can answer these by querying entities, but there's no structured analysis, no trends, no dashboard.

## What it answers

- **Topic distribution** — what do I write about? Weighted by entity count, recency, depth.
- **Content gaps** — topics mentioned but never developed into posts. Links saved but never referenced.
- **Publishing cadence** — how often do I publish? Trends over time. Dry spells.
- **Content health** — drafts that never shipped. Old posts that could be refreshed.
- **Traffic overview** — which content gets the most views? Traffic trends.

One tool — `system_insights` — answers "how is my brain doing?" The agent doesn't need to know which of five tools to call and stitch together.

## Design

### Extensible InsightsRegistry

Core provides the `InsightsRegistry` and generic insight types. Plugins register domain-specific insights. Core stays entity-type agnostic.

```
system_insights({ type: "overview" })           // core — entity counts, recent activity, health summary
system_insights({ type: "publishing-cadence" })  // core — creation trends by month
system_insights({ type: "content-health" })      // core — drafts, stale entities
system_insights({ type: "topic-distribution" })  // topics plugin — topics ranked by sources
system_insights({ type: "traffic-overview" })    // analytics plugin — page views, top pages
```

### Plugin registration

Plugins register insight handlers via `context.insights.register()`:

```typescript
// In topics plugin onRegister():
context.insights.register("topic-distribution", async (entityService) => {
  const topics = await entityService.listEntities("topic");
  // ... aggregate sources, sort by count
  return { topics: [...] };
});

// In analytics plugin onRegister():
context.insights.register("traffic-overview", async () => {
  // ... query Cloudflare for recent traffic summary
  return { pageviews, topPages, visitors };
});
```

The `system_insights` tool dispatches to the registry. Description auto-includes all registered types.

### Why not just use existing tools?

- `analytics_query` stays for detailed queries ("show me traffic for last Tuesday")
- Analytics _also_ registers a `traffic-overview` insight for the big picture
- Different granularity — detailed tool vs summary insight — not redundant

### Dashboard widget (Phase 3)

Visual content insights on the dashboard page. Shows charts/stats at a glance. Uses the dashboard's existing hydration system.

## Steps

### Phase 1: Core insights tool ✅

1. `InsightsRegistry` class with `register()` and `get()` methods
2. Three built-in generic insights: `overview`, `publishing-cadence`, `content-health`
3. `system_insights` tool that dispatches to registry
4. Exposed on `SystemServices` for shell wiring
5. Tests including extensibility verification

### Phase 2: Plugin-registered insights

1. Expose `InsightsRegistry` on plugin contexts (`EntityPluginContext`, `ServicePluginContext`)
2. Topics plugin registers `topic-distribution` insight
   - Topics ranked by source count
   - Source types per topic (post, note, link, etc.)
   - Orphaned topics (no sources)
3. Analytics plugin registers `traffic-overview` insight
   - Recent page views and visitors (last 7 days)
   - Top pages
   - Graceful degradation when Cloudflare credentials absent
4. Tests for each plugin's insight handler

### Phase 3: Dashboard widget

1. Create content insights dashboard widget
2. Register via dashboard plugin's widget messaging
3. Client-side chart rendering (simple bar charts, no charting library — SVG or CSS)
4. Tests

## Files affected

| Phase | Files | Nature                                                    |
| ----- | ----- | --------------------------------------------------------- |
| 1     | ~4    | InsightsRegistry, system tool, schemas, shell wiring ✅   |
| 2     | ~6    | Plugin contexts, topics insight, analytics insight, tests |
| 3     | ~5    | Widget component, registration, styling                   |

## Verification

Phase 1 (done):

1. `system_insights({ type: "overview" })` returns entity counts and health summary
2. `system_insights({ type: "publishing-cadence" })` returns monthly breakdown
3. `system_insights({ type: "content-health" })` returns drafts and stale entities
4. Unknown types return clear error with available types listed
5. Plugins can register custom insight types

Phase 2:

1. `system_insights({ type: "topic-distribution" })` returns topics sorted by source count
2. `system_insights({ type: "traffic-overview" })` returns recent traffic summary
3. Both work only when their plugin is enabled
4. Graceful degradation when data is unavailable (no Cloudflare key, no topics)
5. Existing plugin tests still pass

Phase 3:

1. Dashboard shows topic distribution and content health at a glance
