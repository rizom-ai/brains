---
"@brains/core": patch
---

Stop and join projection sweeps, wakeups, and queued scheduler work before closing persistence during Shell shutdown. Retire asynchronous boot subscriptions while their endpoint and database dependencies remain available. Wait for durable projection-job completion before advancing dependent rules or completing the wave, including during coordination sweeps; trigger advancement from the terminal-success callback.
