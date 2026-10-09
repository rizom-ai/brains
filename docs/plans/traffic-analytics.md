# Plan: Traffic analytics

## Status

Proposed. Depends on [system-analytics-tool.md](./system-analytics-tool.md)
for the agent surface; everything else here is new.

## Goal

A brain keeps its own record of site traffic, connects it to the content it
published, and shows it to the anchor in Studio:

- daily traffic captured as entities while Cloudflare's counts are exact;
- traffic per published entity (an essay's views after it went out, the
  referrals a LinkedIn post brought);
- one typed agent surface over that record (`system_analytics`);
- a Studio Traffic workspace with a chart over time and a dashboard widget.

## Why

Today the analytics plugin is a pass-through to Cloudflare Web Analytics:

- **No history.** Cloudflare answers windows of at most 13 weeks and keeps
  exact counts for about a week; after that a day is sampled (about one page
  load in ten on yeehaa.io), so its numbers are estimates in steps of about
  ten. The brain stores nothing, so every question past a week is an
  estimate and every question past 13 weeks has no answer.
- **No link to content.** Requests are paths; nothing maps
  `/essays/infrastructure-not-platforms` to the `post` it renders, so the
  brain cannot say how a piece it published performed.
- **Two agent surfaces.** `system_insights` `traffic-overview` (a fixed
  7-day summary) and `analytics_query` (totals for a range, no series).
  [system-analytics-tool.md](./system-analytics-tool.md) folds these.
- **No view.** Studio's operator views cover stats, lists, facts and maps;
  none draws a series over time.

## Shape

```text
Cloudflare GraphQL ──(daily recurring check, worker)──▶ traffic-snapshot entities (one per ISO week)
                                                            │
             EntityUrlGenerator (site entity display) ──────┤ path → entity
                                                            ▼
                        system_analytics traffic reports ◀──┴──▶ Studio Traffic workspace + dashboard widget
```

Everything reads the snapshots. Cloudflare is queried only by the capture
and for today's partial numbers.

### The snapshot entity

`traffic-snapshot`, owned by `plugins/analytics` as a compound package
(entity under `src/entity/`, per `plugins/AGENTS.md`). One entity per ISO
week, id `YYYY-Www`, markdown with the numbers in frontmatter and a short
generated summary in the body:

- `days`: per date, `pageviews`, `visits`, `estimated` (Cloudflare's sample
  interval was above about 1.5 for that day).
- `paths`: per date, the top 50 request paths with pageviews (query string
  and trailing slash stripped).
- `referrers`: per date, top referring hosts with visits, and the top
  path × referrer pairs (what brought readers to which page).
- `countries`: per date, top countries with visits.

Weekly keeps the store at about 52 files a year, each readable on its own
and synced with the rest of the content. Visibility is `restricted`:
traffic is operational data for the anchor.

### Capture

A daily `recurringChecks` check (`cadence: "daily"`, as unified-inbox's
digest registers one), registered in `onRegister` so it runs in the worker:

1. Fetch yesterday per day (one GraphQL query per date, the finest
   sampling Cloudflare offers) plus the two days before, so late events and
   a missed run are absorbed.
2. Upsert those dates into their week's snapshot; a date whose stored
   counts are exact is not overwritten by a later, sampled read.
3. A day the check could not capture within Cloudflare's exact window is
   stored when next reachable, marked `estimated`.

**Backfill.** When no snapshot exists, the first run imports what
Cloudflare still has (13 weeks, one query per day), marking sampled days
`estimated`.

### Traffic per entity

Paths map to entities through `EntityUrlGenerator.generateUrl(type, slug)`
over the site's entity display: for every entity type with a route, the
report builds each entity's path and reads its counts. No reverse URL
parsing, and a site that changes its routes changes the join with it.

Reports this enables: views per entity over a range; views in the first
seven days after `publishedAt`; referrers for an entity's path (LinkedIn
on the day its social post went out).

### Agent surface

The traffic reports become `system_analytics` report definitions (see
[system-analytics-tool.md](./system-analytics-tool.md)), read from
snapshots, with today added live when the range includes it:

- `traffic-overview` — totals, change against the previous period, top
  paths, referrers, countries; params `days` or a date range, `limit`.
- `traffic-series` — pageviews and visits per day or week; params as above
  plus `interval`.
- `traffic-by-entity` — views per published entity; params range, entity
  type, `limit`, `firstDays` (views in the first N days after publishing).

All three declare `minVisibility: "admin"`, matching the snapshots'
`restricted` visibility. `analytics_query` is removed, not aliased.

### Studio

- **Chart view.** A series view in `shared/operator-view-react` (bars per
  day, a crosshair tooltip, light and dark tokens), the first chart in the
  operator set, reusable by any workspace.
- **Traffic workspace.** Summary figures (last 7 days against the 7
  before, the period total, busiest day), the daily chart with publishing
  dates marked, top content linked to its entities, referrers.
- **Dashboard widget.** Last 7 days against the 7 before, with a link to
  the workspace.

## Phases

Thin slices, each shippable and tested in an execution-only (worker)
process, since that process runs no ready phase and takes no ordinary
subscriptions:

1. **Capture.** Entity type, adapter, daily check, backfill. Done when a
   deployed brain has a snapshot for yesterday whose numbers match
   Cloudflare's for that day, and 13 weeks backfilled.
2. **Reports.** `traffic-overview` and `traffic-series` as
   `system_analytics` definitions over snapshots; `analytics_query` gone.
   Lands with or after system-analytics-tool phase 2.
3. **Traffic per entity.** The path join and `traffic-by-entity`.
4. **Studio.** Chart view, Traffic workspace, dashboard widget.

## Validation

- Unit: snapshot schema and adapter round-trip; upsert keeps exact counts
  over later sampled reads; path normalization; the entity join against a
  site entity display; report params and visibility floors.
- Worker: the capture check registers and runs in an execution-only
  context, and writes a snapshot.
- Evals: traffic questions use `system_analytics` traffic reports; "how
  did my last essay do" uses `traffic-by-entity`.
- Live, on the yeehaa rover: the day after deploy, yesterday's snapshot
  matches Cloudflare's per-day query; the workspace chart matches the
  snapshots.
