---
"@brains/recurring-checks": patch
"@rizom/brain": patch
---

Keep recurring-check service shutdown and plugin unregistration behind their cleanup barriers when a scheduler adapter throws synchronously from `stop()`. Cancel and drain admitted checks and catch-up enqueue work before reporting the original failure, and retain declaration-order aggregation of synchronous and asynchronous failures.
