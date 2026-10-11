# System analytics tool

## Status

Phases 1–3 shipped: `system_insights` became `system_analytics`, reports are
typed definitions, and the traffic reports replaced `analytics_query`. Phase 4
remains.

## Goal

One extensible, typed surface for aggregate questions about the brain —
metrics, distributions, report-style answers — kept apart from entity reads
(`system_list`, `system_get`, `system_search`).

## Current state

- `system_analytics` takes `{ type, params }`. Its input schema is built after
  plugins register: `type` is an enum of every report, and `params` shows each
  report's fields. The registry (`AnalyticsRegistry` in `@brains/plugins`)
  validates params against the report's own schema, refuses a report below its
  `minVisibility`, and hands the handler the caller's derived
  `visibilityScope`, with a public caller reading published entities only.
- Plugins register with
  `context.analytics.register(defineAnalyticsReport({ type, description, params, minVisibility?, handler }))`.
- Reports: `overview`, `publishing-cadence` and `content-health` (core),
  `topic-distribution` (topics), `traffic-overview`, `traffic-series` and
  `traffic-by-entity` (analytics, admin-only, read from the daily
  `traffic-snapshot` entities; Studio's Traffic workspace and dashboard
  widget read the same reports).

## Phase 4 — Tighten report quality

- Make `topic-distribution` a real distribution once topic projection can give
  counts or source coverage; today it lists topics and titles.
- Give the core reports params where a caller needs them: a date range and
  entity types for `publishing-cadence`, a stale threshold and entity types for
  `content-health`.
- Enable the analytics plugin in evals (it is `evalDisable`d in the canonical
  bundle from when it needed Cloudflare) with traffic cases: a traffic question
  uses `traffic-overview`, "how did my last essay do" uses
  `traffic-by-entity` with `firstDays`.

## Validation

- Core tests for each core report's params and output.
- Canonical professional-posture evals: metrics, cadence and health requests
  use `system_analytics`; a general overview of content uses `system_list`.

## Decisions

- Report definitions carry no output schema. The Traffic workspace and widget
  parse what the traffic reports return with their own schemas, so drift fails
  them; a field on the definition waits for a consumer that reads any report.
