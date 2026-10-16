---
"@rizom/brain": minor
---

`system_insights` is now `system_analytics`, and its reports take typed params. A plugin registers a report with `context.analytics.register(defineAnalyticsReport({ type, description, params, minVisibility?, handler }))`; the tool shows every report and its params to the model, validates params against the report's schema, and refuses a report to callers below its `minVisibility`. `context.insights` and the `(type, handler)` registration are removed, with no alias.
