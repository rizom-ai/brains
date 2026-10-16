---
"@brains/job-queue": patch
"@rizom/brain": patch
---

Apply bounded asynchronous SQLite lock retries to queue claims, progress, heartbeats and terminal writes, including contention with enqueue transactions through the same client. Preserve attempt/session fencing and existing job retry policy; retry rejected database statements rather than handlers, and propagate non-lock errors or an exhausted write budget.
