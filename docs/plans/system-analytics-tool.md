# System analytics tool

## Status

Proposed.

## Goal

Replace the vague `system_insights` surface with an extensible, typed analytics/reporting surface that can cover both core content analytics and plugin-provided analytics such as Cloudflare traffic.

The target user-facing tool is:

- `system_analytics`

It should answer aggregate/report-style questions cheaply without forcing an LLM to list and inspect many entities, while staying clearly separate from entity reads (`system_list`, `system_get`, `system_search`).

## Why this exists

`system_insights` currently works, but the name is misleading. "Insights" sounds like freeform interpretation or content summarization, which encourages the agent to use it when it should read actual content. The implementation is really an analytics registry:

- core registers generic content reports;
- topics registers topic distribution;
- analytics registers Cloudflare traffic overview.

The capability is useful, but the product concept should be analytics/reports, not vague insights.

## Current state

The current `system_insights` tool accepts:

```ts
{
  type: string;
}
```

Registered handlers today include:

- `overview` — entity counts, total entities, recent activity, draft/published counts.
- `publishing-cadence` — entity creation counts by month/type.
- `content-health` — drafts and stale content.
- `topic-distribution` — topic entities/titles from the topics plugin.
- `traffic-overview` — fixed 7-day Cloudflare summary from the analytics plugin.

Limitations:

- handler params are not typed or exposed to the LLM;
- Cloudflare has a separate `analytics_query` tool for date ranges and limits;
- the name `system_insights` overlaps with normal content summarization;
- `topic-distribution` is not actually a counted distribution yet;
- tool description has to compensate for naming ambiguity.

## Desired model

Analytics should be a plugin-extensible registry where each report declares:

- a stable report type id;
- a human-readable description;
- a typed params schema;
- side-effect metadata, normally read-only;
- a handler that receives typed params plus caller visibility scope.

The LLM-facing tool should use a generated discriminated union, not a loose `Record<string, unknown>`:

```ts
system_analytics({
  type: "traffic-overview",
  params: {
    days: 30,
    limit: 10,
  },
});
```

Conceptually:

```ts
type SystemAnalyticsInput =
  | { type: "overview"; params?: OverviewParams }
  | { type: "publishing-cadence"; params?: PublishingCadenceParams }
  | { type: "content-health"; params?: ContentHealthParams }
  | { type: "topic-distribution"; params?: TopicDistributionParams }
  | { type: "traffic-overview"; params?: TrafficOverviewParams };
```

This matters for LLM reliability: the model should see valid report types and the allowed params for each type in the tool schema.

## Proposed public semantics

### `system_analytics`

Use for aggregate analytics, metrics, distributions, and report-style questions.

Examples:

- "How many drafts do I have?"
- "What is my publishing cadence?"
- "Which content is stale?"
- "What topics do I write about most?"
- "How was site traffic last month?"

Do not use for:

- listing actual content items unless the report is explicitly an inventory report;
- summarizing or quoting entity bodies;
- answering "what have I written?" when the user expects titles/items/content.

Those should use `system_list` / `system_get` / `system_search`.

## API shape

Introduce a registry contract along these lines:

```ts
interface AnalyticsReportDefinition<TParams, TResult> {
  type: string;
  description: string;
  paramsSchema: z.ZodType<TParams>;
  handler: (
    params: TParams,
    context: {
      entityService: ICoreEntityService;
      visibilityScope: ContentVisibility;
      toolContext: ToolContext;
    },
  ) => Promise<TResult>;
}
```

The system tool builds its input schema from registered report definitions after plugin registration, so plugin-provided analytics become visible to the LLM as first-class typed variants.

## Migration plan

### Phase 1 — Rename without changing behavior

- Rename `system_insights` to `system_analytics`.
- Rename core files/types from insights to analytics where low risk.
- Keep current behavior: `{ type }` only.
- Update Rover evals and system instructions.
- Do not keep a tool alias unless a compatibility need appears before implementation.

### Phase 2 — Registry definitions with params

- Change registry entries from `(type, handler)` to report definitions.
- Add params schemas for built-ins:
  - `overview`: optional entity type filters if useful.
  - `publishing-cadence`: optional date range and entity types.
  - `content-health`: optional stale threshold and entity types.
  - `topic-distribution`: optional limit and include counts once counts exist.
  - `traffic-overview`: days/date range/limit.
- Build the `system_analytics` input schema as a discriminated union from registered definitions.

### Phase 3 — Fold Cloudflare query into analytics

- Move `analytics_query` behavior into `system_analytics` via `traffic-overview` params or a more specific `traffic-query` report.
- Decide whether to remove `analytics_query` cleanly or leave it as a plugin-local CLI/admin affordance only.
- Ensure no duplicate LLM-callable traffic analytics surface remains in Rover.

### Phase 4 — Tighten report quality

- Make `topic-distribution` a real distribution if topic projection can provide counts or source coverage.
- Add report output schemas where practical.
- Add dashboard/API reuse if the same analytics definitions should power UI widgets.

## LLM/tooling requirements

The LLM-facing schema must not be loose.

Acceptable:

- discriminated union by `type`;
- each variant documents report-specific params;
- unknown type fails with a helpful available-types message.

Avoid:

- `{ type: string; params: Record<string, unknown> }` as the only public schema;
- separate one-off plugin analytics tools in the default LLM surface when the same behavior can be expressed as `system_analytics`.

## Permission and visibility

Analytics must respect caller visibility:

- public callers only see public aggregate data;
- trusted callers may include shared data;
- anchor callers may include restricted data.

Handlers must receive a derived `visibilityScope`; they should not compute visibility from raw user-auth data themselves.

Traffic analytics may expose operational/site data. Default visibility can remain public only if the report output is safe for public callers. Otherwise individual report definitions should be able to declare a minimum tool/report visibility.

## Validation

Required checks:

- core system analytics tests for name, metadata, visibility filtering, and built-in reports;
- plugin registration tests for typed plugin reports;
- analytics plugin tests proving Cloudflare params are visible and validated through `system_analytics`;
- Rover eval updates for:
  - general content overview uses `system_list`, not `system_analytics`;
  - metrics/cadence/health requests use `system_analytics`;
  - traffic requests use the Cloudflare-backed analytics report when configured.

## Open questions

- Should the final name be `system_analytics` or `system_reports`? Current preference: `system_analytics`.
- Should traffic analytics be public-visible, trusted-visible, or anchor-only by default?
- Should `analytics_query` be removed cleanly once Cloudflare params are available via `system_analytics`, or kept as a non-agent/CLI tool?
- Do report definitions need output schemas in the first typed-params phase, or can that come later?
