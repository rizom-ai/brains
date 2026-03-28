# Plan: Simplify Sync Tools

## Status: complete (except Phase 6)

## Context

Directory-sync had three tools from before the git-sync merge:

| Tool                        | What it does            |
| --------------------------- | ----------------------- |
| `directory-sync_sync`       | Queue batch import jobs |
| `directory-sync_git_sync`   | Commit + push           |
| `directory-sync_git_status` | Git status              |

From the user's perspective, "sync" means "make everything consistent." The split between filesystem sync and git sync is an implementation detail.

## What's done

- ✅ Merged three tools into two (`sync` + `status`)
- ✅ Deleted `git-tools.ts` (`git_sync`, `git_status`)
- ✅ Status tool returns sync path, lastSync, watching, git info (conditional)
- ✅ Updated YAML test cases for new tool names
- ✅ Sync tool uses `queueSyncBatch()` (non-blocking)
- ✅ Removed dead `fullSync()` method
- ✅ Removed unused `_entityTypes` param from `prepareBatchOperations`
- ✅ Fixed lock scope: pull + queueSyncBatch run inside the same `withLock`
- ✅ Fixed metadata forwarding: `interfaceType`/`channelId` passed to batch metadata
- ✅ Fixed tool description (no longer claims orphan cleanup or commit/push)
- ✅ Auto-export always registered regardless of `autoSync` — entities created via tools get written to disk
- ✅ Periodic sync uses `queueSyncBatch()` instead of blocking `sync()`
- ✅ Initial sync uses `queueSyncBatch()` + polls `getBatchStatus()` instead of blocking `sync()`
- ✅ Orphan cleanup runs as `directory-cleanup` job at end of every batch
- ✅ Deleted inline-implementation test files (prompt-materialization, job-tracking, simplified-tools)
- ✅ Full edge case test coverage (sync tool, status tool, auto-export, cleanup job)

## Design

### Sync tool (non-blocking)

```
User calls directory-sync_sync
  ↓
if git: withLock {
  1. git pull
  2. queueSyncBatch() — queues import jobs + cleanup
}
else: queueSyncBatch()
  ↓
return { batchId, importOperations, totalFiles, gitPulled }
  ↓
(background) job queue: imports one by one, then orphan cleanup
  ↓
(background) auto-commit detects entity changes, commits + pushes
```

### Status tool

```json
{
  "syncPath": "/data/brain",
  "lastSync": "2026-03-28T14:30:00Z",
  "watching": true,
  "git": {
    "branch": "main",
    "hasChanges": false,
    "ahead": 0,
    "behind": 0,
    "remote": "origin"
  }
}
```

Git field omitted when git not configured.

## Phase 6: Clean up test mock patterns

Replace `as unknown as GitSync` / `as unknown as DirectorySync` casts with properly typed mock factories (like `createMockGitSync` in `sync-tools.test.ts`). Affects `periodic-sync.test.ts`, `git-lock.test.ts`, `setup-initial-sync-git.test.ts`, and others.
