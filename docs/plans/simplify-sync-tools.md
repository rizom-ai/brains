# Plan: Simplify Sync Tools

## Context

Directory-sync has three tools from before the git-sync merge:

| Tool                        | What it does            |
| --------------------------- | ----------------------- |
| `directory-sync_sync`       | Queue batch import jobs |
| `directory-sync_git_sync`   | Commit + push           |
| `directory-sync_git_status` | Git status              |

From the user's perspective, "sync" means "make everything consistent." The split between filesystem sync and git sync is an implementation detail.

## Current state (partially implemented)

We already:

- ✅ Added `fullSync()` to DirectorySync (pull → sync → commit+push)
- ✅ Added status tool (sync path, lastSync, watching, git info)
- ✅ Deleted git-tools.ts (git_sync, git_status)
- ✅ Updated plugin to pass gitSync to tool factory
- ✅ Updated YAML test cases
- ❌ Deleted batch-operations.ts — REGRESSION, must restore
- ❌ Deleted queueSyncBatch() — REGRESSION, must restore
- ❌ Sync tool calls fullSync() synchronously — BLOCKS event loop

## Problem: blocking imports

There are two places where imports block the event loop:

### 1. Sync tool (user-initiated)

The sync tool now calls `fullSync()` which calls `sync()` which calls `importEntities()` — a tight loop over all files. For 100+ entities, this blocks MCP/Discord for seconds.

The old tool called `queueSyncBatch()` which queued individual import jobs into the job queue worker. Each job processes one file, then yields to the event loop before the next. This is what kept the brain responsive.

**Fix**: Restore `queueSyncBatch()` and `BatchOperationsManager`. Sync tool calls git pull → `queueSyncBatch()` → returns immediately. Auto-commit handles git push after imports complete.

### 2. Periodic sync + initial sync (background)

`setupPeriodicGitSync` and `setupInitialSync` both call `directorySync.sync()` directly — same tight import loop. During periodic sync (every 2 min) and initial startup, the brain is unresponsive.

**Fix**: These should also use the job queue for imports. Change `sync()` to queue import jobs instead of running them inline. Or add a `syncViaJobQueue()` method.

However, this is a bigger change: `sync()` currently returns an `ImportResult` with counts. If it queues jobs instead, it returns immediately and the results come later via events. The callers (`setupInitialSync`, `setupPeriodicGitSync`) would need to subscribe to completion events instead of awaiting results.

This is out of scope for the tool simplification. Track separately.

## Design

### Sync tool (non-blocking)

```
User calls directory-sync_sync
  ↓
1. git pull (if configured) — fast async I/O
2. queueSyncBatch() — queues import jobs, returns immediately
3. return { batchId, importOperations, totalFiles, gitPulled }
  ↓
(background) job queue processes imports one by one
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

## Remaining steps

1. Restore `batch-operations.ts` and `queueSyncBatch()` (revert deletion)
2. Restore `batch-export-regression.test.ts` (revert deletion)
3. Write tests: sync tool calls `queueSyncBatch()` not `fullSync()`, returns immediately
4. Rewrite sync tool: git pull → `queueSyncBatch()` → return batch info
5. Update plugin: pass `pluginContext` back to tool factory (needed for `queueSyncBatch`)
6. Verify non-blocking behavior

## Future work (out of scope)

- Make periodic sync use job queue for imports
- Make initial sync use job queue for imports
- Consider removing `fullSync()` if nothing uses it after tool fix

## Files

| File                                   | Action                               |
| -------------------------------------- | ------------------------------------ |
| `src/lib/batch-operations.ts`          | Restore                              |
| `src/lib/directory-sync.ts`            | Restore `queueSyncBatch()`           |
| `test/batch-export-regression.test.ts` | Restore                              |
| `src/tools/index.ts`                   | Sync: pull → queueSyncBatch → return |
| `src/plugin.ts`                        | Pass pluginContext to tool factory   |
| `test/sync-tools.test.ts`              | New: verify non-blocking behavior    |
