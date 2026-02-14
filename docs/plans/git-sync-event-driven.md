# Plan: Fix Git-Sync — Event-Driven Commit/Push

## Context

Two persistent problems with git-sync:

1. **Commits not automatically pushed** — `autoSync` defaults to `false` in the schema and is not set in `brain.config.ts`. The auto-sync timer never starts. The only push happens after `sync:initial:completed` (startup) or manual `sync()` tool call. So entities created/updated during normal operation are written to disk by directory-sync but never committed or pushed.

2. **Changes not always picked up** — There's no event bridge between directory-sync and git-sync. When directory-sync writes a file (on `entity:created`/`entity:updated`/`entity:deleted`), git-sync has no way to know. It only acts on startup events and the manual sync tool.

### Root Cause

The fundamental gap: directory-sync writes files reactively (entity events → disk), but git-sync only reads the disk state on a timer that **isn't running** by default. There's no event from directory-sync to git-sync saying "I wrote a file, commit it."

### Current Flow (broken)

```
Entity created → directory-sync writes .md file → ... nothing ...
                                                   (file sits uncommitted)
```

### Desired Flow

```
Entity created → directory-sync writes .md file → emits event
                                                    → git-sync receives event
                                                    → debounced commit + push
```

## Threading Model

Git operations (clone, pull, push, commit) run as **child processes** via `simple-git` (`child_process.spawn`), so they don't block the CPU or event loop. The coordination logic (status checks, debouncing, event handlers) runs on the **main event loop** as async/await — non-blocking but single-threaded.

### Concurrency guard

Without a guard, a second debounce timer could fire while a commit/push is still in progress, causing concurrent git operations that conflict. The implementation uses a simple boolean lock:

```typescript
private syncing = false;

// Inside the debounced handler:
if (this.syncing) return; // Skip — current cycle will pick up all changes
this.syncing = true;
try {
  // commit + push
} finally {
  this.syncing = false;
}
```

This works because Node.js is single-threaded: the `if (this.syncing)` check and `this.syncing = true` assignment are atomic (no race between check and set). The lock simply prevents a second async commit/push chain from starting while one is in-flight.

If changes arrive while `syncing` is true, the debounce timer resets normally. When the current cycle finishes and `syncing` becomes false, the next timer firing will pick up all accumulated changes.

## Solution

**Event-driven git-sync**: Git-sync subscribes to entity change events and performs debounced commit+push. No polling timer needed.

### Changes

#### 1. `plugins/git-sync/src/plugin.ts` — Subscribe to entity events

Add subscriptions to `entity:created`, `entity:updated`, and `entity:deleted` in `onRegister()`. Each triggers a debounced commit+push cycle.

```typescript
// After sync:initial:completed handler:

// Debounced commit+push on entity changes
private commitTimeout?: Timer;
private syncing = false;

const debouncedCommitAndPush = () => {
  if (this.commitTimeout) clearTimeout(this.commitTimeout);
  this.commitTimeout = setTimeout(() => {
    void (async () => {
      if (this.syncing) return;
      this.syncing = true;
      try {
        const git = this.getGitSync();
        const status = await git.getStatus();
        if (status.hasChanges) {
          await git.commit();
          this.logger.info("Auto-committed entity changes");
        }
        if (status.remote) {
          const freshStatus = await git.getStatus();
          if (freshStatus.ahead > 0) {
            await git.push();
            this.logger.info("Auto-pushed entity changes");
          }
        }
      } catch (error) {
        this.logger.warn("Failed to auto-commit/push", { error });
      } finally {
        this.syncing = false;
      }
    })();
  }, this.config.commitDebounce);
};

context.messaging.subscribe("entity:created", async () => {
  debouncedCommitAndPush();
  return { success: true };
});

context.messaging.subscribe("entity:updated", async () => {
  debouncedCommitAndPush();
  return { success: true };
});

context.messaging.subscribe("entity:deleted", async () => {
  debouncedCommitAndPush();
  return { success: true };
});
```

**Why 5s debounce**: Entity operations often come in batches (e.g., creating a blog post triggers entity creation + cover image + embedding updates). A 5-second debounce collects these into a single commit.

**Why not use the existing auto-sync timer**: The timer polls every 5 minutes regardless of activity. Event-driven is both more responsive (commits within seconds) and more efficient (no-op when nothing changes).

**Why the concurrency guard**: `simple-git` runs git commands as child processes, but concurrent git operations on the same repo can corrupt state. The boolean lock ensures only one commit/push cycle runs at a time — safe because Node.js is single-threaded (check+set is atomic).

#### 2. `plugins/git-sync/src/plugin.ts` — Clean up timer on shutdown

Clear the `commitTimeout` in `onUnregister()`:

```typescript
protected async onUnregister(): Promise<void> {
  if (this.commitTimeout) {
    clearTimeout(this.commitTimeout);
  }
  if (this.gitSync) {
    await this.gitSync.cleanup();
  }
}
```

#### 3. `plugins/git-sync/src/types.ts` — Add `commitDebounce` config option

```typescript
commitDebounce: z
  .number()
  .min(1000)
  .describe("Debounce time in ms before committing entity changes")
  .default(5000),
```

#### 4. Change `autoSync` timer to pull-only

The existing `autoSync` timer calls `sync()` which does pull + commit + push. With event-driven commit/push handling outbound changes, the timer should only pull. Change `startAutoSync()` in `git-sync.ts`:

```typescript
// Before: full sync (pull + commit + push)
this.syncTimer = setInterval(() => {
  void this.sync();
}, this.syncInterval * 1000);

// After: pull only (inbound changes from CMS or other instances)
this.syncTimer = setInterval(() => {
  void (async () => {
    try {
      await this.pull();
    } catch (error) {
      this.logger.error("Auto-pull failed", { error });
    }
  })();
}, this.syncInterval * 1000);
```

This gives a clean separation:

- **Event-driven**: commit + push (outbound, triggered by entity changes)
- **Timer-based**: pull only (inbound, for remote changes from CMS or other instances)

## What This Fixes

| Problem                 | Before                                | After                                          |
| ----------------------- | ------------------------------------- | ---------------------------------------------- |
| Entity created via tool | File written, never committed         | File written → 5s → committed + pushed         |
| Entity updated via tool | File updated, never committed         | File updated → 5s → committed + pushed         |
| Entity deleted via tool | File deleted, never committed         | File deleted → 5s → committed + pushed         |
| Batch operations        | Each change triggers nothing          | All changes in 5s window → single commit       |
| Concurrent operations   | N/A                                   | Guarded — only one commit/push cycle at a time |
| Startup                 | Works (pull → import → commit → push) | Unchanged                                      |

## What About the `autoSync` Config?

The `autoSync: false` default remains correct for standalone use. When a CMS or second brain instance is involved, enable it for periodic pulls. The event-driven approach handles all commit/push — the timer never commits or pushes.

## Key Files

| File                                   | Change                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| `plugins/git-sync/src/plugin.ts`       | Subscribe to entity events, debounced commit+push with concurrency guard, cleanup |
| `plugins/git-sync/src/types.ts`        | Add `commitDebounce` config option                                                |
| `plugins/git-sync/src/lib/git-sync.ts` | Change `startAutoSync()` from full `sync()` to `pull()` only                      |

## Verification

1. `bun run typecheck` — no errors
2. `bun test` in `plugins/git-sync` — existing tests pass
3. Manual test:
   - Start the brain app
   - Create an entity via the agent ("write a blog post about X")
   - Wait 5 seconds
   - Check `git log` in brain-data → new commit with the entity
   - Check remote → commit pushed
4. Batch test:
   - Create multiple entities in quick succession
   - Verify they're all in a single commit (not separate commits per entity)

## Key Reference Files

- `plugins/git-sync/src/plugin.ts` — current event subscriptions (lines 66-128)
- `plugins/git-sync/src/lib/git-sync.ts` — `commit()` and `push()` methods
- `plugins/directory-sync/src/plugin.ts` — entity event subscribers that write files (lines 500-560)
