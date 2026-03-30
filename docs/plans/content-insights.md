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

**Prerequisite — Shell refactor:** `createInsightsRegistry()` is currently called inline at `shell.ts:610` inside an object literal. The `Shell` class does not retain the instance, so plugins cannot access it. Before plugin registration can work:

1. Hoist registry to `private insightsRegistry` field on `Shell`
2. Add `getInsightsRegistry(): InsightsRegistry` to `IShell` interface (`shell/plugins/src/interfaces.ts`)
3. Add `insights: { register }` to `BasePluginContext` (`shell/plugins/src/base/context.ts`) — flows to Entity/Service contexts automatically

**Note on tool description:** `system_insights` description is composed at `createSystemTools` call time using `services.insights.getTypes().join(", ")`. This works correctly if plugins register insights during `onRegister()` (line 157) before system tools are created (line 171) — but only once the prerequisite refactor gives plugins access to the registry.

**Steps:**

1. Shell refactor: hoist registry, expose on `IShell`, wire into `BasePluginContext`
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

**Approach:** Use `CustomWidget` renderer from `WIDGET_RENDERERS`. Adding a new renderer type would require cross-package changes to both the registry and `@brains/ui-library`'s `RENDERER_MAP` — not worth it for a data display. Can graduate to a dedicated renderer later if needed.

1. Create content insights dashboard widget using `CustomWidget` renderer
2. Register via dashboard plugin's widget messaging (pattern: `messageBus.send("dashboard:register-widget", ...)`)
3. Data provider calls `services.insights.get("overview")` and `services.insights.get("content-health")`
4. Client-side chart rendering (simple bar charts, no charting library — SVG or CSS)
5. Tests

## Files affected

| Phase | Files | Nature                                                                            |
| ----- | ----- | --------------------------------------------------------------------------------- |
| 1     | ~4    | InsightsRegistry, system tool, schemas, shell wiring ✅                           |
| 2     | ~9    | Shell refactor, IShell, 3 context files, topics insight, analytics insight, tests |
| 3     | ~5    | Widget component, registration, styling                                           |

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
