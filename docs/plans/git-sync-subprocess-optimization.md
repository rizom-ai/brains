# Comprehensive git-sync optimization — reduce subprocess waste

## Context

Git-sync spawns an excessive number of git subprocesses across all its flows, causing CPU spikes and UI stutter. An audit revealed:

| Flow                             | Current subprocesses | Root cause                                    |
| -------------------------------- | -------------------- | --------------------------------------------- |
| Manual sync (`sync` tool)        | 23-25                | `getStatus()` called 3x (5 subprocesses each) |
| Startup (`system:plugins:ready`) | 7-8                  | `getStatus()` (5) + `pull()`                  |
| Entity debounce (auto-commit)    | 10-15                | `getStatus()` called 2x                       |
| Initial sync completed           | ~10                  | `getStatus()` (5) + commit + push             |
| Auto-sync (pull every N min)     | 2-3                  | Already lean, but triggers full reimport      |

**Core problem**: `getStatus()` runs 5 git subprocesses (`status`, `checkIsRepo`, `branch`, `log`, `getRemotes`) and is called 7 times across the codebase. Most callers only need 1-2 pieces of info.

**Secondary problem**: `pull()` always triggers full `entity:import:request` with `{}`, causing directory-sync to scan ALL files even when nothing changed.

**Bug found**: The `status.behind === 0` early exit added to `pull()` is unreliable — when the local branch doesn't track the remote (e.g. `git init` instead of `git clone`), `status.behind` is always 0, so pull is incorrectly skipped.

## Changes

### 1. Add lightweight helpers to `GitSync` class

**File**: `plugins/git-sync/src/lib/git-sync.ts`

Add two methods that avoid the 5-subprocess `getStatus()`:

- `hasRemote(): boolean` — returns `!!this.remoteUrl` (0 subprocesses)
- `quickStatus(): Promise<{ isClean: boolean; ahead: number }>` — wraps `git.status()` (1 subprocess)

Keep `getStatus()` unchanged — it's still used by the status tool for full user-facing info.

### 2. Fix and simplify `pull()`

**File**: `plugins/git-sync/src/lib/git-sync.ts` — `pull()` method

Remove the buggy `fetch()` + `status.behind === 0` early exit. Instead:

1. `git.status()` — check for uncommitted local changes (1 subprocess)
2. If dirty, `commit()` first (~4 subprocesses)
3. `git.pull()` — always pull, it's fast when nothing to merge (1 subprocess)
4. Check `pullResult.files.length` — skip import if 0
5. If files changed, send `entity:import:request` with `{ paths: pullResult.files }`
6. Handle "couldn't find remote ref" in catch block

**Result**: 2 subprocesses (clean) or ~6 (dirty) — down from 3 + full reimport.

### 3. Optimize `sync()`

**File**: `plugins/git-sync/src/lib/git-sync.ts` — `sync()` method

Replace 3x `getStatus()` (15 subprocesses) with targeted calls:

```
STEP 1: if (this.hasRemote()) → pull()          [0 + 2 subprocesses]
STEP 2: quickStatus() → if dirty, commit()      [1 + ~4 subprocesses]
STEP 3: if (shouldPush) → push()                [1 subprocess]
```

Push decision: `manualSync || (autoPush && status.ahead > 0) || !remoteBranchExists`

**Result**: 4 subprocesses (nothing to do) to ~8 (commit+push) — down from 23-25.

### 4. Optimize plugin.ts event handlers

**File**: `plugins/git-sync/src/plugin.ts`

**`system:plugins:ready`** (line 88): Replace `getStatus()` with `hasRemote()`

```typescript
if (git.hasRemote()) {
  await git.pull();
}
```

Result: 0 + pull subprocesses — down from 5 + pull.

**`sync:initial:completed`** (line 120): Replace `getStatus()` with `quickStatus()`

```typescript
const qs = await git.quickStatus();
if (!qs.isClean) {
  await git.commit();
}
if (git.hasRemote() && qs.ahead > 0) {
  await git.push();
}
```

Result: 1 + commit/push — down from 5 + commit/push.

**Entity debounce** (line 145): Replace 2x `getStatus()` with `quickStatus()` + `hasRemote()`

```typescript
const qs = await git.quickStatus();
if (!qs.isClean) {
  await git.commit();
}
if (git.hasRemote()) {
  const fresh = await git.quickStatus();
  if (fresh.ahead > 0) {
    await git.push();
  }
}
```

Result: 2 + commit/push — down from 10 + commit/push.

### 5. Fix test and add comprehensive test coverage

**File**: `plugins/git-sync/test/pull-skip-unchanged.test.ts`

Fix existing second test (fails because `sync(true)` push fails after pull).
Add test for "pull with no file changes skips import".

### 6. Re-enable auto-sync

**File**: `apps/professional-brain/brain.config.ts`

Set `autoSync: true` with `syncInterval: 5` (5 minutes).

## Expected subprocess counts after optimization

| Flow                               | Before          | After                  |
| ---------------------------------- | --------------- | ---------------------- |
| Manual sync (nothing to do)        | 23-25           | 4                      |
| Manual sync (pull + commit + push) | 23-25           | ~10                    |
| Auto-sync pull (nothing changed)   | 2-3 + full scan | 2 (no import)          |
| Auto-sync pull (files changed)     | 2-3 + full scan | 2 + selective import   |
| Startup                            | 7-8 + full scan | 2-3 + selective import |
| Entity debounce                    | 10-15           | 6-8                    |
| Initial sync completed             | ~10             | 5-7                    |

## Verification

1. `bun test plugins/git-sync/` — all tests pass (including new/fixed tests)
2. `bun run typecheck` — passes
3. `bun run lint` — no errors
4. `bun test plugins/directory-sync/` — unchanged, still passes
