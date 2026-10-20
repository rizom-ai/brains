---
"@brains/directory-sync": patch
---

Reduce Git sync load by importing only pulled paths, avoiding cleanup for non-deletion pulls, suppressing duplicate watcher echoes, batching watcher changes, and skipping no-op Git commit/push cycles.
