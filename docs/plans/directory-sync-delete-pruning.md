# Directory sync delete pruning

## Problem

Production git sync can pull deleted markdown files without removing the matching rows from the entity database. The content worktree is correct, but stale entities remain visible because periodic git sync queues import batches only.

Observed on `doc-brain`: `brain-data/skill` was empty after sync, while `/data/brain.db` still contained 257 `skill` entities.

## Current behavior

- `DirectorySync.sync()` imports files and then calls `removeOrphanedEntities()`.
- Periodic git sync uses `queueSyncBatch(...)`, not `sync()`.
- Batch sync supports cleanup via `includeCleanup`, but periodic sync and the manual sync tool do not pass it.
- `BatchOperationsManager.prepareBatchOperations()` returns early when there are no files, so cleanup cannot be queued for delete-only pulls.

## Fix plan

1. Make periodic git sync queue cleanup:
   - `setupPeriodicGitSync()` should call `queueSyncBatch(..., { includeCleanup: true })`.
2. Make the `directory-sync_sync` tool queue cleanup as well.
3. Update batch preparation so `includeCleanup: true` can enqueue a `directory-cleanup` operation even when there are zero import files.
4. Add regression tests for:
   - periodic sync passes `includeCleanup: true`;
   - manual sync passes `includeCleanup: true`;
   - cleanup-only batches are not dropped when `files.length === 0`.
5. Consider paginating orphan cleanup beyond the current `limit: 1000` per entity type.

## Notes

File watcher deletion already has a separate `directory-delete` path. The production failure was git pull deletion through periodic batch sync.
