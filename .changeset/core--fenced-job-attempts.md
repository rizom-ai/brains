---
"@brains/job-queue": patch
"@brains/utils": patch
"@rizom/brain": patch
---

Bound background job execution with per-handler deadlines and required cancellation signals. Persist worker sessions and renewable attempt leases, fence completion, failure, progress, and heartbeat writes by unique attempt token, and immediately recover attempts when a stable worker slot starts a replacement session.
