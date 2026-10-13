---
"@brains/job-queue": patch
---

Retry atomic-enqueue write-transaction conflicts against a time budget (2s, jittered exponential backoff) instead of a fixed attempt cap, in both the acquire and commit phases. App-level retries stand in for SQLite's busy_timeout here, so any attempt cap was a latent failure under slow-runner contention.
