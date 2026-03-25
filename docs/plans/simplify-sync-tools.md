# Plan: Simplify Sync Tools

## Context

Directory-sync has three tools from before the git-sync merge:

| Tool                        | What it does                     |
| --------------------------- | -------------------------------- |
| `directory-sync_sync`       | Queue batch export + import jobs |
| `directory-sync_git_sync`   | Commit + push                    |
| `directory-sync_git_status` | Git status                       |

From the agent's perspective, "sync" means "save everything and push." The split between filesystem sync and git sync is an implementation detail. And the batch job queuing in `directory-sync_sync` adds complexity — it creates separate export/import jobs per entity type, returns a batchId, and the agent has to track it.

## Design

Two tools:

| Tool                    | What it does                                        |
| ----------------------- | --------------------------------------------------- |
| `directory-sync_sync`   | Pull → import → export → commit → push (full cycle) |
| `directory-sync_status` | Git status + last sync time                         |

### sync tool

One tool does everything in order:

```
1. git pull (if git configured)
2. import files → entities (picks up remote changes)
3. export entities → files (writes local changes)
4. orphan cleanup
5. git commit + push (if git configured, if changes exist)
```

This is the same cycle as `setupPeriodicGitSync` already does, just triggered manually instead of on a timer. The tool can reuse that logic directly.

No batch jobs. No job queue. The sync runs inline — it's fast enough (seconds, not minutes). The periodic sync already runs inline. The batch approach was over-engineering for a filesystem operation.

### status tool

Combines git status + sync metadata:

```json
{
  "lastSync": "2026-03-25T14:30:00Z",
  "git": {
    "isRepo": true,
    "hasChanges": false,
    "branch": "main",
    "ahead": 0,
    "behind": 0,
    "remote": "origin"
  }
}
```

If git is not configured, the `git` field is omitted.

### Under the hood

The sync tool calls `directorySync.fullSync(gitSync?)` — a new method that combines the existing pieces:

```typescript
async fullSync(gitSync?: GitSync): Promise<SyncResult> {
  // Pull remote changes
  if (gitSync) {
    await gitSync.withLock(async () => {
      await gitSync.pull();
    });
  }

  // Import files → entities + cleanup orphans
  const importResult = await this.importEntities();
  await this.removeOrphanedEntities();

  // Export entities → files
  const exportResult = await this.exportEntities();

  // Commit + push if changes
  if (gitSync) {
    await gitSync.withLock(async () => {
      if (await gitSync.hasLocalChanges()) {
        await gitSync.commit();
        await gitSync.push();
      }
    });
  }

  return { importResult, exportResult };
}
```

This replaces the batch job approach (`queueSyncBatch`) for the manual sync tool. The periodic sync and auto-sync can also call `fullSync` instead of reimplementing the cycle.

## What gets deleted

- `plugins/directory-sync/src/tools/git-tools.ts` — git_sync and git_status tools
- `queueSyncBatch` method on DirectorySync (if no other callers)
- `BatchOperationsManager` (if only used by queueSyncBatch)
- Batch-related job handlers (export-batch, import-batch) if only used by the tool

## What gets simplified

- `plugins/directory-sync/src/tools/index.ts` — sync tool calls `fullSync()` directly, no batch
- `plugins/directory-sync/src/lib/git-periodic-sync.ts` — can call `fullSync()` instead of inline cycle
- `plugins/directory-sync/src/plugin.ts` — `getTools()` returns 2 tools instead of conditionally building 1-3

## What stays

- Auto-sync (file watcher → import on change) — different concern, stays as-is
- Auto-commit (debounced git commit on entity changes) — stays as-is
- Periodic sync (timer-based full cycle) — stays, uses `fullSync()`
- Initial sync — stays, may also use `fullSync()`
- Message handlers (entity:export:request, entity:import:request) — stay for cross-plugin use

## Steps

1. Add `fullSync(gitSync?)` to DirectorySync
2. Rewrite sync tool to call `fullSync()` — no batch jobs
3. Rename `git_status` → `status`, add lastSync, make git fields conditional
4. Delete `git-tools.ts` and `git_sync` tool
5. Update periodic sync to use `fullSync()`
6. Check if batch operations can be removed (may still be used by initial sync)
7. Update tests
8. Update agent instructions if they reference old tool names

## Verification

1. `bun test plugins/directory-sync/`
2. `directory-sync_sync` does full pull → import → export → commit → push
3. `directory-sync_status` returns git status + last sync time
4. Periodic sync still works (uses fullSync)
5. Auto-sync (file watcher) still works
6. Auto-commit still works
7. No reference to `git_sync` or `git_status` tools anywhere
