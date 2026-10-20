---
"@rizom/brain": patch
---

The `topic-distribution` report is now a distribution. Each topic carries `sources`: the visible source entities whose current extraction votes support it, merged topics folded in, so a source may count for several topics. Topics are sorted by that count. A new `coverage` gives the visible source entities, how many extraction has read (`attributed`) and how many it has not read since their last change (`unattributed`), so a partly extracted brain does not read as a settled one. Previously the report listed topic ids and titles only, and the agent could not say which topics were most common.
