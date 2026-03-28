# Plan: Simplify Sync Tools

## Context

Directory-sync has three tools from before the git-sync merge:

| Tool                        | What it does            |
| --------------------------- | ----------------------- |
| `directory-sync_sync`       | Queue batch import jobs |
| `directory-sync_git_sync`   | Commit + push           |
| `directory-sync_git_status` | Git status              |

From the user's perspective, "sync" means "make everything consistent." The split between filesystem sync and git sync is an implementation detail. The batch job queuing adds complexity for no benefit — the operation takes seconds.

## Design

Two tools:

| Tool                    | What it does                                 |
| ----------------------- | -------------------------------------------- |
| `directory-sync_sync`   | Pull → import + cleanup → commit + push      |
| `directory-sync_status` | Git status + last sync time + sync path info |

### sync tool

One tool does everything in order:

```
1. git pull (if git configured)
2. import files → entities + orphan cleanup
3. git commit + push (if git configured, if changes exist)
```

No explicit export step — auto-sync subscribers handle export reactively when entities change. Adding an explicit export would risk overwriting user edits with stale DB content before imports run.

Returns:

```json
{
  "imported": 42,
  "orphansDeleted": 0,
  "gitPushed": true
}
```

### status tool

Combines git status + sync metadata:

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

If git is not configured, the `git` field is omitted.

### Under the hood

The sync tool calls `directorySync.fullSync(gitSync?)` — a new method that combines existing pieces:

```typescript
async fullSync(gitSync?: GitSync): Promise<FullSyncResult> {
  if (gitSync) {
    await gitSync.withLock(async () => {
      await gitSync.pull();
    });
  }

  const syncResult = await this.sync(); // import + orphan cleanup

  let gitPushed = false;
  if (gitSync) {
    await gitSync.withLock(async () => {
      if (await gitSync.hasLocalChanges()) {
        await gitSync.commit();
        await gitSync.push();
        gitPushed = true;
      }
    });
  }

  return {
    imported: syncResult.import.imported,
    orphansDeleted: syncResult.import.jobIds.length,
    gitPushed,
  };
}
```

This is the same cycle as `setupPeriodicGitSync` already does. The periodic sync will also call `fullSync()` instead of reimplementing the cycle.

## Files deleted

- `src/tools/git-tools.ts` — git_sync and git_status tools
- `src/lib/batch-operations.ts` — BatchOperationsManager (only used by sync tool)
- `test/git/git-tools.test.ts` — tests for deleted tools
- `test/batch-export-regression.test.ts` — tests batch-only behavior being removed

## Files modified

- `src/lib/directory-sync.ts` — add `fullSync(gitSync?)`, remove `queueSyncBatch` + BatchOperationsManager
- `src/tools/index.ts` — sync calls `fullSync()`, new status tool
- `src/plugin.ts` — pass `gitSync` to tool factory, remove `createGitTools` import
- `src/lib/git-periodic-sync.ts` — call `fullSync(gitSync)` instead of inline cycle
- `test/plugin.test.ts` — update tool count/name expectations
- `test/git/periodic-sync.test.ts` — update assertions for fullSync call
- YAML test cases — update tool names (`git_sync` → `sync`, `git_status` → `status`)

## What stays untouched

- Auto-sync (file watcher → import on change)
- Auto-commit (debounced git commit on entity changes)
- Initial sync (already calls `directorySync.sync()` directly)
- Message handlers (`entity:export:request`, `entity:import:request`)
- All job handlers and pipelines

## Steps

1. Write tests for `fullSync()`, new sync tool, and new status tool
2. Add `fullSync(gitSync?)` to DirectorySync
3. Rewrite sync tool to call `fullSync()` — no batch jobs
4. Add status tool (git status + lastSync, git fields conditional)
5. Delete `git-tools.ts` and `batch-operations.ts`
6. Update `plugin.ts` — pass gitSync to tool factory, remove git tools import
7. Update periodic sync to use `fullSync()`
8. Update YAML test cases for new tool names
9. Delete stale test files

## Verification

1. `bun run typecheck`
2. `bun test plugins/directory-sync/`
3. `bun run lint`
4. `directory-sync_sync` does full pull → import → commit → push
5. `directory-sync_status` returns git status + last sync time
6. Periodic sync still works (uses fullSync)
7. Auto-sync (file watcher) still works
8. No reference to `git_sync`, `git_status`, or `BatchOperationsManager` anywhere
