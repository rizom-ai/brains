---
"@rizom/brain": patch
---

`defineEntity` accepts `analyticsReports`, declared with `defineEntityAnalyticsReport`, which add typed reports to `system_analytics` that read definition-typed entities at the caller's visibility. `@rizom/brain/entities` exports `defineEntityAnalyticsReport`, `EntityAnalyticsReportDeclaration` and `EntityAnalyticsReportContext`.
