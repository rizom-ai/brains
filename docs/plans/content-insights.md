# Plan: Content Insights Follow-on

## Open work

The only remaining work in scope here is optional UI follow-on.

### Dashboard widget

If operators still want it, add lightweight dashboard widget(s) that surface existing insight outputs such as:

- `overview`
- `content-health`
- `topic-distribution`

Constraints:

- use existing dashboard registration patterns
- avoid inventing a new insights-only rendering system
- keep the widget as a thin presentation layer over existing `system_insights` output

## Non-goals

- rewriting the current `system_insights` architecture
- splitting `system_insights` into multiple tool names without a real need
- treating dashboard UI as a prerequisite for the insights system itself

## Done when

One of these is true:

1. a dashboard widget ships for the existing insight outputs, or
2. we explicitly decide the widget is not worth building and delete this plan
