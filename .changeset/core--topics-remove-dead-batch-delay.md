---
"@brains/topics": patch
---

Remove `sourceChangeBatchDelayMs` from the topics plugin config. It was introduced with a batching implementation in `topic-projection.ts`, which was later deleted when topic projections moved to the scheduler-owned wave rule. The option has been declared with a default of 1000 and consumed nowhere since, so setting it never had any effect. Wave timing is owned by the scheduler.
