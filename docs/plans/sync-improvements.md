# Plan: Sync Improvements

## Context

The directory-sync plugin has three issues causing errors and unnecessary work:

1. **Import pipeline crashes on git-pulled paths** (active bug): Git-sync sends raw `pullResult.files` to directory-sync's `entity:import:request`. These include `_obsidian/bases/*.base` files and git rename-format paths like `{old => new}`. The import pipeline tries to read them and fails.

2. **File watcher feedback loop**: When directory-sync exports an entity to a file, the file watcher detects that write as an external change and re-imports it — wasted work and potential loops.

3. **Redundant initial sync job**: `initial-sync.ts` calls both `queueSyncJob()` (line 109) AND `directorySync.sync()` (line 113), creating two parallel import paths that can race.

The merge strategy (`-Xtheirs`) and conflict marker safety check are already implemented per `MERGE-CONFLICT-FIX-PLAN.md` — no changes needed there.

## Change 1: Filter Invalid Paths in Import Pipeline

**Problem**: `importEntities()` receives paths from git-sync that include non-importable files (`_obsidian/bases/Notes.base`, `{base.md => base.md.invalid}` rename format). `readEntity()` throws, causing error noise.

**Solution**: Reuse the existing `shouldProcessPath()` from `file-watcher.ts` in the import pipeline. Move it to a shared location and apply it when `paths` are provided.

### Files

| File                                                | Change                                                       |
| --------------------------------------------------- | ------------------------------------------------------------ |
| `plugins/directory-sync/src/lib/file-watcher.ts`    | Extract `shouldProcessPath` to shared module                 |
| `plugins/directory-sync/src/lib/path-filter.ts`     | **New** — shared `shouldProcessPath` + `cleanGitPath`        |
| `plugins/directory-sync/src/lib/import-pipeline.ts` | Filter `paths` through `shouldProcessPath` before processing |
| `plugins/directory-sync/test/path-filter.test.ts`   | **New** — tests for path filtering and git rename cleanup    |

### Path Filtering Logic

```typescript
// path-filter.ts — extracted from file-watcher.ts + new git path handling

export function cleanGitPath(path: string): string | null {
  // Handle git rename format: "{old => new}" or "dir/{old => new}"
  const renameMatch = path.match(/\{.+? => (.+?)\}/);
  if (renameMatch) {
    return path.replace(/\{.+? => (.+?)\}/, renameMatch[1]);
  }
  return path;
}

export function shouldProcessPath(path: string): boolean {
  // Skip underscore-prefixed directories
  const segments = path.split("/");
  if (segments.some((s) => s.startsWith("_"))) return false;
  // Only process .md files (images handled separately)
  if (path.endsWith(".md")) return true;
  return false;
}
```

### Integration in import-pipeline.ts

At `importEntities()` line 38, filter provided paths:

```typescript
const rawPaths = paths ?? deps.fileOperations.getAllSyncFiles();
const filesToProcess = paths
  ? rawPaths
      .map(cleanGitPath)
      .filter((p): p is string => p !== null && shouldProcessPath(p))
  : rawPaths;
```

## Change 2: File Watcher Write Suppression

**Problem**: `FileOperations.writeEntity()` writes a file → `FileWatcher` sees the change → re-imports the same entity → triggers another export cycle.

**Solution**: Add a `WriteSuppressor` that tracks recently-written paths. The file watcher checks this before processing a change.

### Files

| File                                                   | Change                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| `plugins/directory-sync/src/lib/write-suppressor.ts`   | **New** — simple TTL-based path suppression                        |
| `plugins/directory-sync/test/write-suppressor.test.ts` | **New** — unit tests                                               |
| `plugins/directory-sync/src/lib/file-watcher.ts`       | Accept optional `WriteSuppressor`, skip suppressed paths           |
| `plugins/directory-sync/src/lib/file-operations.ts`    | Accept optional `WriteSuppressor`, call `suppress()` after writing |
| `plugins/directory-sync/src/lib/directory-sync.ts`     | Create shared `WriteSuppressor`, pass to both                      |

### WriteSuppressor Design

Simple class — tracks paths with TTL expiry. No external deps.

```typescript
export class WriteSuppressor {
  private suppressedPaths = new Map<string, number>();
  constructor(private readonly ttlMs = 5000) {}

  suppress(path: string): void {
    this.suppressedPaths.set(path, Date.now() + this.ttlMs);
  }

  isSuppressed(path: string): boolean {
    const expiry = this.suppressedPaths.get(path);
    if (!expiry) return false;
    if (Date.now() > expiry) {
      this.suppressedPaths.delete(path);
      return false;
    }
    return true;
  }
}
```

### Integration

**FileOperations.writeEntity()** — after `writeFileSync()` on lines 206/208:

```typescript
this.writeSuppressor?.suppress(filePath);
```

**FileWatcher.handleFileChange()** — at top of method (line 107):

```typescript
if (this.writeSuppressor?.isSuppressed(path)) {
  this.logger.debug("Skipping self-generated change", { path });
  return;
}
```

Both accept `WriteSuppressor` as an optional constructor parameter — no breaking changes.

## Change 3: Remove Redundant Initial Sync Job

**Problem**: `setupInitialSync()` calls `queueSyncJob()` (line 109) which queues a batch job, then immediately calls `directorySync.sync()` (line 113) which does its own import. Two parallel import paths race.

**Solution**: Remove the `queueSyncJob()` call. `directorySync.sync()` is the correct mechanism — it returns job IDs that we wait for.

### Files

| File                                             | Change                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `plugins/directory-sync/src/lib/initial-sync.ts` | Remove `queueSyncJob()` call on line 109; remove the function if unused elsewhere |

## Implementation Order

1. Path filtering (`path-filter.ts` + tests) — fixes the active bug
2. Wire path filtering into `import-pipeline.ts` + update `file-watcher.ts` imports
3. `WriteSuppressor` class + tests (isolated, no deps)
4. Wire into `FileWatcher` and `FileOperations`
5. Wire shared instance in `DirectorySync`
6. Remove redundant `queueSyncJob` from `initial-sync.ts`

## Verification

- `bun test plugins/directory-sync/` — all tests pass
- `bun run typecheck` — clean
- `bun run lint` — clean
