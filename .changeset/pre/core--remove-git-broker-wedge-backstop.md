---
"@rizom/brain": patch
---

The Git broker is no longer replaced automatically when it stays alive but stops completing work, and `/health/operate` no longer degrades on stale Git progress. That backstop existed for a Bun defect that lost subprocess completions (oven-sh/bun#26580), which Bun 1.4.0 fixes. A broker that exits is still replaced once its process group is proven gone, and the replacement reconciles the work it left. The `git-broker-heartbeat-timeout` and `git-broker-progress-stale` supervisor incidents are gone.
