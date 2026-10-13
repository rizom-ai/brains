---
"@brains/db": patch
---

Opening a local SQLite database retries its connection pragmas when another connection briefly holds a lock, instead of failing at once. Since connections stopped waiting on locks, entering WAL mode, which needs an exclusive lock, failed immediately whenever another process was mid-write or closing the same file, so a start-up or migration racing another process could fail. Refused pragmas now retry asynchronously with the same budget and backoff as a refused transaction begin.
