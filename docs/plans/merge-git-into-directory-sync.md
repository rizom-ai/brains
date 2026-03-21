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
  `entity:export:request`, entity CRUD events, and `sync:initial:completed`
  continue to work for other consumers (e.g., site-builder rebuilds on
  `sync:initial:completed`)

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
      autoSync: z.boolean().default(false),
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

### Plugin config

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

### Presets

Remove `"git-sync"` from all preset arrays in brain models. Git is now a
config option on `directory-sync`, not a separate plugin ID. `directory-sync`
stays in the presets.

### Files to migrate

- `apps/professional-brain/brain.yaml` — move `plugins.git-sync` → `plugins.directory-sync.git`
- `apps/professional-brain/deploy/brain.yaml` — same
- `apps/mylittlephoney/brain.yaml` — move `plugins.git-sync` → `plugins.directory-sync.git`
- `apps/mylittlephoney/deploy/brain.yaml` — same
- `apps/collective-brain/brain.yaml` — same
- `apps/collective-brain/deploy/brain.yaml` — same
- `apps/team-brain/brain.yaml` — same
- `apps/team-brain/deploy/brain.yaml` — same
- `apps/team-brain/dist/brain.yaml` — same

## Brain Model Registration Migration

Before (e.g., `brains/rover/src/index.ts`):

```typescript
import { gitSyncPlugin } from "@brains/git-sync";

// In capabilities:
["directory-sync", directorySync, { seedContent: true, initialSync: true }],
["git-sync", gitSyncPlugin, (env) => ({
  authToken: env["GIT_SYNC_TOKEN"],
  autoSync: true,
  autoPush: true,
  syncInterval: 5,
})],

// In presets:
const minimal = ["system", "note", "link", ..., "directory-sync", "git-sync", ...];
```

After:

```typescript
// No git-sync import

// In capabilities:
["directory-sync", directorySync, (env) => ({
  seedContent: true,
  initialSync: true,
  git: {
    authToken: env["GIT_SYNC_TOKEN"],
    autoSync: true,
    autoPush: true,
    syncInterval: 5,
  },
})],

// In presets — "git-sync" removed, "directory-sync" stays:
const minimal = ["system", "note", "link", ..., "directory-sync", ...];
```

Same change applies to `brains/ranger` and `brains/relay`.

## File Changes

### Move into directory-sync

| From (git-sync)                               | To (directory-sync)                           | Notes                          |
| --------------------------------------------- | --------------------------------------------- | ------------------------------ |
| `src/lib/git-sync.ts`                         | `src/lib/git-sync.ts`                         | Simplify API, remove messaging |
| `src/handlers/sync-handler.ts`                | `src/handlers/gitSyncJobHandler.ts`           | Rename for consistency         |
| `src/formatters/git-sync-status-formatter.ts` | `src/formatters/git-sync-status-formatter.ts` | Keep as-is                     |
| `src/schemas.ts` (status schema)              | Merge into `src/schemas.ts`                   | Add git status fields          |

### Modify in directory-sync

| File                      | Change                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `src/plugin.ts`           | Create `GitSync` when `config.git` present. Register git tools. Wire debounced commit. |
| `src/types.ts`            | Add `git` config block to schema.                                                      |
| `src/lib/initial-sync.ts` | Remove message listeners. Call `gitSync.pull()` directly, then import.                 |
| `src/lib/auto-sync.ts`    | Add entity CRUD → debounced git commit+push.                                           |
| `package.json`            | Add `simple-git` dependency.                                                           |

### Delete

| File/Directory      | Reason                            |
| ------------------- | --------------------------------- |
| `plugins/git-sync/` | Entire plugin removed after merge |

### Update references

| File                         | Change                                                                  |
| ---------------------------- | ----------------------------------------------------------------------- |
| `brains/rover/src/index.ts`  | Remove git-sync import/registration, add `git` config to directory-sync |
| `brains/ranger/src/index.ts` | Same                                                                    |
| `brains/relay/src/index.ts`  | Same                                                                    |
| `brains/*/package.json`      | Remove `@brains/git-sync` dependency                                    |

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
   ├── Import pulled files (direct call, no message bus)
   ├── Remove orphaned entities
   ├── Emit sync:initial:completed (consumed by site-builder, etc.)
   └── Start file watcher + git auto-sync timer
```

### Startup (without git)

```
1. DirectorySyncPlugin.onRegister()
   ├── Create DirectorySync instance
   └── Register entity CRUD subscribers (auto-sync, no git)

2. system:plugins:ready event
   ├── Import entities from disk
   ├── Remove orphaned entities
   ├── Emit sync:initial:completed
   └── Start file watcher
```

### Entity change (auto-sync)

```
entity:created / entity:updated / entity:deleted
  → DirectorySync writes/deletes file on disk
  → If git enabled: debounced GitSync.commit() + push()
```

### Auto-sync cycle (when git enabled + autoSync)

```
Every syncInterval:
  1. GitSync.pull()
  2. Import changed files (direct call)
  3. Remove orphaned entities (if deletions detected)
  4. GitSync.commit() + push() (if new local commits)
```

## GitSync Simplification

With direct integration, `GitSync` becomes a pure git operations class:

- **Remove `sendMessage` dependency** — no more `entity:import:request` inside `pull()`
- **`pull()` returns changed file paths** instead of triggering import
- **`sync()` removed** — the plugin orchestrates pull/commit/push
- **`startAutoSync()` removed** — the plugin owns the timer

Simplified API:

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

All 15 git-sync test files (+ 1 formatter test) move to
`plugins/directory-sync/test/git/`.

Tests that use `GitSync` directly need minimal changes (remove messaging mocks).
Tests that use `GitSyncPlugin` harness need rewriting to use
`DirectorySyncPlugin` with `git` config.

### Key test scenarios to preserve

- Clone/init repo on first startup
- Pull with merge conflict resolution (modify/delete, rename)
- Push with and without upstream tracking
- Auto-push after entity changes (debounced)
- Startup ordering: pull before import
- Git disabled: no git operations attempted
- Seed content skipped when git remote has content
- `sync:initial:completed` still emitted after startup

## Implementation Order

1. **Add `git` config block** to directory-sync schema and plugin
2. **Copy `GitSync` class** into directory-sync, simplify API (remove messaging)
3. **Wire startup lifecycle** — git pull → import → cleanup in `initial-sync.ts`
4. **Wire entity change → git commit** — debounced commit+push in `auto-sync.ts`
5. **Wire auto-sync timer** — periodic pull+import+cleanup+push in plugin
6. **Move tools** — add git_sync and git_status tools
7. **Move tests** — adapt all test files
8. **Update brain models** — rover, ranger, relay: remove git-sync import/registration,
   merge config into directory-sync, remove `"git-sync"` from presets
9. **Update brain.yaml files** — all apps: move `plugins.git-sync` → `plugins.directory-sync.git`
10. **Delete `plugins/git-sync/`** — remove package, update workspace
11. **Update docs** — codebase map, any references

Steps 1–6 can land while git-sync still exists (both plugins registered).
Steps 8–10 are the cutover. This allows incremental validation.
