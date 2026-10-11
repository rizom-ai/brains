---
"@rizom/brain": patch
---

Built-in dashboard widgets read entities at the viewer's visibility, which `registerBuiltInDashboardWidget` now passes to `load` as `visibilityScope`. They read public entities only before, so the owner's dashboard showed none of their restricted conversation memory (summaries, decisions, action items, coverage) or non-public topics, wishes, skills and pipeline drafts.
