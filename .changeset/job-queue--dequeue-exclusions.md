---
"@brains/job-queue": patch
---

Allow dequeue callers to exclude up to 256 registered execution types for a single claim without mutating finalized handler declarations. Validate exclusions before dispatch and send only the narrowed execution-type list over the existing owner RPC contract.
