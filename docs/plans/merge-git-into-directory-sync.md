# Plan: Merge git-sync into directory-sync

## Motivation

git-sync and directory-sync are tightly coupled through a fragile message bus
handshake. Every production bug in git-sync (merge conflicts, push failures,
orphan cleanup) has been caused by the interaction between the two plugins, not
by either one in isolation. Merging eliminates the indirection and gives a
single plugin ownership of the full file-sync lifecycle.

## Design Principles

- **Git is optional** — when no `git` config is provided, directory-sync
  behaves exactly as it does today (local file sync only)
- **Single lifecycle owner** — one plugin owns pull → import → cleanup →
  commit → push, with clear ordering and no hidden side effects
- **No message bus for internal coordination** — the startup handshake
  (`git:sync:registered`, `git:pull:completed`, `sync:initial:completed`)
  becomes internal control flow
- **External messages preserved** — `entity:import:request`,
  `entity:export:request`, and entity CRUD events continue to work for
  other consumers

## Config Schema (after merge)

```typescript
directorySyncConfigSchema = z.object({
  // Existing directory-sync config (unchanged)
  syncPath: z.string().optional(),
  autoSync: z.boolean().default(true),
  watchInterval: z.number().default(1000),
  includeMetadata: z.boolean().default(true),
  entityTypes: z.array(z.string()).optional(),
  initialSync: z.boolean().default(true),
  initialSyncDelay: z.number().default(1000),
  syncBatchSize: z.number().default(10),
  syncPriority: z.number().default(3),
  seedContent: z.boolean().default(true),
  seedContentPath: z.string().optional(),
  deleteOnFileRemoval: z.boolean().default(true),

  // New: optional git config block
  git: z
    .object({
      repo: z.string().optional(), // "owner/name" shorthand
      gitUrl: z.string().optional(), // full remote URL
      branch: z.string().default("main"),
      autoSync: z.boolean().default(false), // git auto-sync (pull+push on interval)
      syncInterval: z.number().default(5), // minutes
      commitMessage: z.string().optional(),
      authorName: z.string().optional(),
      authorEmail: z.string().optional(),
      authToken: z.string().optional(),
      autoPush: z.boolean().default(true),
      commitDebounce: z.number().default(5000), // ms
    })
    .optional(),
});
```

When `git` is `undefined` or omitted, all git functionality is disabled.

## brain.yaml Migration

Before:

```yaml
plugins:
  git-sync:
    repo: rizom-ai/professional-brain-content
    authorName: Yeehaa
    authorEmail: yeehaa@rizom.ai
```

After:

```yaml
plugins:
  directory-sync:
    git:
      repo: rizom-ai/professional-brain-content
      authorName: Yeehaa
      authorEmail: yeehaa@rizom.ai
```

## Brain Model Registration Migration

Before (e.g., rover):

```typescript
[directorySync, { seedContent: true, initialSync: true }],
[gitSyncPlugin, (env) => ({
  authToken: env["GIT_SYNC_TOKEN"],
  autoSync: true,
  autoPush: true,
  syncInterval: 5,
})],
```

After:

```typescript
[directorySync, (env) => ({
  seedContent: true,
  initialSync: true,
  git: {
    authToken: env["GIT_SYNC_TOKEN"],
    autoSync: true,
    autoPush: true,
    syncInterval: 5,
  },
})],
```

## File Changes

### Move into directory-sync

| From (git-sync)                               | To (directory-sync)                           | Notes                                                               |
| --------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| `src/lib/git-sync.ts`                         | `src/lib/git-sync.ts`                         | Keep as-is, remove messaging deps                                   |
| `src/handlers/sync-handler.ts`                | `src/handlers/gitSyncJobHandler.ts`           | Rename for consistency                                              |
| `src/formatters/git-sync-status-formatter.ts` | `src/formatters/git-sync-status-formatter.ts` | Keep as-is                                                          |
| `src/schemas.ts` (status schema)              | Merge into `src/schemas.ts`                   | Add git status fields                                               |
| `src/tools/index.ts` (2 tools)                | Merge into `src/tools/index.ts`               | Add `directory-sync_git_sync` and `directory-sync_git_status` tools |

### Modify in directory-sync

| File                          | Change                                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/plugin.ts`               | Conditionally create `GitSync` instance when `config.git` is present. Move startup handshake from message bus to direct calls. Register git tools only when git is enabled. |
| `src/types.ts`                | Add `git` config block to schema. Add git-related job schemas.                                                                                                              |
| `src/lib/initial-sync.ts`     | Remove `git:sync:registered` / `git:pull:completed` message listeners. Call `gitSync.pull()` directly when git is enabled, then run initial import.                         |
| `src/lib/message-handlers.ts` | Remove `entity:import:request` orphan cleanup (git pull calls import + cleanup directly now). Keep handler for external consumers.                                          |
| `src/lib/auto-sync.ts`        | Add entity CRUD → debounced git commit+push (currently in git-sync's `plugin.ts`).                                                                                          |
| `package.json`                | Add `simple-git` dependency.                                                                                                                                                |

### Delete

| File/Directory      | Reason                            |
| ------------------- | --------------------------------- |
| `plugins/git-sync/` | Entire plugin removed after merge |

### Update references

| File                       | Change                                                           |
| -------------------------- | ---------------------------------------------------------------- |
| `apps/rover/src/index.ts`  | Remove git-sync registration, add `git` config to directory-sync |
| `apps/ranger/src/index.ts` | Same                                                             |
| `apps/relay/src/index.ts`  | Same                                                             |
| `apps/*/package.json`      | Remove `@brains/git-sync` dependency                             |
| `turbo.json`               | Remove git-sync entries if any                                   |
| `docs/codebase-map.html`   | Update plugin list                                               |

## Lifecycle (after merge)

### Startup (when git is configured)

```
1. DirectorySyncPlugin.onRegister()
   ├── Create DirectorySync instance
   ├── Create GitSync instance (from config.git)
   ├── GitSync.initialize() — clone/init repo
   └── Register entity CRUD subscribers (auto-sync + debounced git commit)

2. system:plugins:ready event
   ├── GitSync.pull() — fetch latest from remote
   ├── DirectorySync.importEntities() — import pulled files
   ├── DirectorySync.removeOrphanedEntities() — clean up deletions
   ├── DirectorySync.exportEntities() — export any DB-only entities
   ├── GitSync.commit() + push() — push any new exports
   └── Start file watcher + git auto-sync timer
```

### Startup (without git)

```
1. DirectorySyncPlugin.onRegister()
   ├── Create DirectorySync instance
   └── Register entity CRUD subscribers (auto-sync, no git)

2. system:plugins:ready event
   ├── DirectorySync.importEntities()
   ├── DirectorySync.removeOrphanedEntities()
   └── Start file watcher
```

### Auto-sync cycle (when git enabled + autoSync)

```
Every syncInterval:
  1. GitSync.pull()
  2. DirectorySync.importEntities(changedPaths)
  3. DirectorySync.removeOrphanedEntities()  — only if paths had deletions
  4. GitSync.commit() + push()               — only if new local commits
```

### Entity change (auto-sync)

```
entity:created / entity:updated / entity:deleted
  → DirectorySync writes/deletes file on disk
  → Debounced: GitSync.commit() + push()
```

## GitSync Simplification

With direct integration, `GitSync` can be simplified:

- **Remove `sendMessage` dependency** — no more `entity:import:request` inside `pull()`
- **`pull()` returns changed file paths** instead of triggering import internally
- **`sync()` is removed** — the plugin orchestrates pull/commit/push directly
- **`startAutoSync()` is removed** — the plugin owns the timer
- **Pre-pull commit moves to the caller** — `pull()` becomes a pure git operation

Simplified `GitSync` API:

```typescript
class GitSync {
  async initialize(): Promise<void>;
  async pull(): Promise<{ files: string[]; remoteBranchExists: boolean }>;
  async commit(message?: string): Promise<void>;
  async push(): Promise<void>;
  async getStatus(): Promise<GitSyncStatus>;
  hasRemote(): boolean;
  cleanup(): void;
}
```

## Test Migration

### Move and adapt

All 16 git-sync test files move to `plugins/directory-sync/test/git/`.
Tests that use `GitSync` directly need minimal changes (remove messaging mocks).
Tests that use `GitSyncPlugin` harness need rewriting to use `DirectorySyncPlugin`
with `git` config.

### Key test scenarios to preserve

- Clone/init repo on first startup
- Pull with merge conflict resolution (modify/delete, rename)
- Push with and without upstream tracking
- Auto-push after entity changes (debounced)
- Startup ordering: pull before import
- Git disabled: no git operations attempted
- Seed content skipped when git remote has content

## Implementation Order

1. **Add `git` config block** to directory-sync schema and plugin
2. **Copy `GitSync` class** into directory-sync, simplify API (remove messaging)
3. **Wire startup lifecycle** — git pull → import → cleanup in `initial-sync.ts`
4. **Wire entity change → git commit** — debounced commit+push in `auto-sync.ts`
5. **Wire auto-sync timer** — periodic pull+import+cleanup+push in plugin
6. **Move tools** — add git_sync and git_status tools
7. **Move tests** — adapt all 16 test files
8. **Update brain models** — rover, ranger, relay registration and brain.yaml
9. **Delete `plugins/git-sync/`**
10. **Update docs** — codebase map, any references

Each step should be a separate commit. Steps 1–6 can land while git-sync still
exists (both plugins registered). Step 8–9 is the cutover. This allows
incremental validation.
