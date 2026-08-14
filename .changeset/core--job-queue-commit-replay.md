---
"@brains/job-queue": patch
---

Recover atomic enqueue from retryable libSQL commit conflicts by rolling back and replaying the complete write transaction. Release projection-admission reservations between attempts so replay cannot leak or double-commit admission state.
