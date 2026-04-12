# Plan: Content Insights

## Context

This is no longer a speculative plan. The core content-insights system already shipped.

Brains now have a structured `system_insights` tool for aggregate content and analytics views, and plugins can register additional insight types through the shared insights registry.

## What is already true

Shipped capabilities:

- `InsightsRegistry` exists in core
- `system_insights` dispatches through that registry
- core built-in insights exist:
  - `overview`
  - `publishing-cadence`
  - `content-health`
- plugins can register domain-specific insights via `context.insights.register()`
- topics plugin registers `topic-distribution`
- analytics plugin registers `traffic-overview`

## Current architecture

### Core

Core owns:

- the registry
- the system tool
- built-in generic insight types
- shell wiring so plugins can register additional insight handlers

Key files:

- `shell/core/src/system/insights.ts`
- `shell/core/src/system/tools.ts`
- `shell/core/src/shell.ts`
- `shell/plugins/src/base/context.ts`
- `shell/plugins/src/interfaces.ts`

### Plugin insights

Current plugin-provided insights:

- `topic-distribution`
  - registered by `entities/topics`
  - implemented in `entities/topics/src/insights/topic-distribution.ts`
- `traffic-overview`
  - registered by `plugins/analytics`
  - implemented in `plugins/analytics/src/insights/traffic-overview.ts`

## Proof in repo

Tests exist for the core and plugin registration path:

- `shell/core/test/system/insights-tool.test.ts`
- `shell/plugins/test/insights-registration.test.ts`
- `entities/topics/test/insights/topic-distribution.test.ts`
- `plugins/analytics/test/insights/traffic-overview.test.ts`

Roadmap visual already treats this work as completed at the system-tool level.

## What remains

Only optional follow-on work remains.

### Dashboard widget

The original Phase 3 proposed a dashboard widget for content insights.

That is not needed for the base content-insights system to be considered complete. If still desired, it should be treated as a separate dashboard enhancement, not as unfinished core infrastructure.

Potential future work:

1. add dashboard widget(s) that surface `overview`, `content-health`, or `topic-distribution`
2. keep widget implementation lightweight and use existing dashboard registration patterns
3. avoid inventing a new insights-only renderer unless there is a clear UI need

## Non-goals

- no rewrite of the shipped `system_insights` architecture
- no splitting the single tool into many tool names unless a real user need appears
- no mandatory dashboard UI before the insights system counts as complete

## Verification

This doc is accurate when all of these remain true:

1. `system_insights` exists and returns built-in core insight types.
2. plugins can register additional insight handlers through plugin context.
3. topics still provide `topic-distribution`.
4. analytics still provides `traffic-overview`.
5. the dashboard widget remains optional follow-on work, not a missing prerequisite.
