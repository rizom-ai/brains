---
"@brains/db": patch
"@brains/entity-service": patch
"@brains/job-queue": patch
---

Local SQLite clients wait out a briefly held lock on every write path, not only when starting a transaction. Since connections stopped waiting on locks natively, a single statement, a batch or a migration that met another connection's write lock failed at once with `SQLITE_BUSY`; in production, embedding writes failed this way and the semantic index came up degraded. Standalone statements, batches and migrations now retry asynchronously under the same policy as transactions, and the retry budget is 5 seconds, as long as the native busy timeout it replaced. Statements inside an open transaction and multi-statement scripts are still never retried.

A refused batch or migration now reopens its connection, as a refused transaction start already did, so the client stays usable for later commits. The job queue keeps its own transaction-level retries as its only contention policy: its client sets `contentionRetryBudgetMs: 0` and surfaces each refusal at once. The entity service's separate write retry is removed; its writes rely on the client's.
