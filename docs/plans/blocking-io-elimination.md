# Plan: Eliminate Blocking I/O from Runtime

## Context

Several synchronous I/O patterns block the event loop during runtime:

- Webserver calls `existsSync()` on every request for clean URL resolution
- Directory-sync plugin uses 19 sync FS calls (readFileSync, writeFileSync, etc.)
- Site build (Preact SSR + Tailwind + image optimization) runs entirely on main thread

These cause latency spikes under load and make the brain unresponsive during builds.

## Phase 1: Webserver async route rewriting

**Problem**: `rewriteRequestPath()` in Hono's `serveStatic` calls `existsSync()` on every request without a file extension. The callback is synchronous — can't use async FS.

**Fix**: Replace `serveStatic` + `rewriteRequestPath` with a custom async middleware that serves clean-URL HTML directly via `Bun.file()`, letting `serveStatic` only handle actual static assets.

**File: `interfaces/webserver/src/server-manager.ts`**

- Remove `existsSync` import
- Add async middleware before `serveStatic` that checks `Bun.file(path/index.html).exists()` and `Bun.file(path.html).exists()`
- If found, serve directly with `Bun.file()` — no need for `serveStatic` to rewrite
- Replace 404 handler's `existsSync(notFoundPath)` with `await Bun.file(notFoundPath).exists()`
- Keep one-time startup `existsSync` checks (acceptable)

**Verify**: `bun test interfaces/webserver/`, manual test clean URLs + 404 + static assets

## Phase 2: Directory-sync async FS conversion

**Problem**: `FileOperations` class uses `readFileSync`, `writeFileSync`, `readdirSync`, `statSync`, `mkdirSync`, `utimesSync` — blocks during entity import/export.

**Fix**: Convert all sync calls to `fs/promises` equivalents. Methods are already async or can be made async. Callers are in async contexts — just add `await`.

**Files**:

- `plugins/directory-sync/src/lib/file-operations.ts` — core conversion (19 calls)
- `plugins/directory-sync/src/lib/seed-content.ts` — existsSync, readdirSync, copyFileSync
- `plugins/directory-sync/src/lib/quarantine.ts` — renameSync, appendFileSync, readFileSync
- `plugins/directory-sync/src/lib/git-sync.ts` — mkdirSync, existsSync, writeFileSync
- `plugins/directory-sync/src/handlers/image-conversion-handler.ts` — readFileSync, writeFileSync
- `plugins/directory-sync/src/handlers/inline-image-conversion-handler.ts` — readFileSync, writeFileSync
- Callers in `directory-sync.ts`, `import-pipeline.ts`, `export-pipeline.ts`, `cleanup-pipeline.ts`

**Verify**: `bun test plugins/directory-sync/`, test import/export cycle

## Phase 3: Worker thread for site builds

**Problem**: Site build (10-60s) blocks main thread — MCP/A2A/Discord can't respond during builds.

**Fix**: Run site-build job handler in a Bun Worker thread. The worker re-opens the SQLite DB read-only and runs the build independently.

**Files**:

- `shell/job-queue/src/worker-job-runner.ts` — new: manages Worker lifecycle
- `shell/job-queue/src/worker-entry.ts` — new: script that runs inside Worker
- `shell/job-queue/src/types.ts` — add `runInWorker?: boolean` to JobHandler
- `shell/job-queue/src/job-queue-worker.ts` — dispatch to worker when `runInWorker` is set
- `plugins/site-builder/src/handlers/siteBuildJobHandler.ts` — set `runInWorker = true`

**Challenge**: Worker threads can't share object references. The worker receives serializable config and re-creates minimal context (DB connection, template registry). Progress reported back via `postMessage`.

**Verify**: Trigger site build, verify MCP/Discord remain responsive

## Files

| File                                                | Phase | Action                                   |
| --------------------------------------------------- | ----- | ---------------------------------------- |
| `interfaces/webserver/src/server-manager.ts`        | 1     | Replace existsSync with async middleware |
| `plugins/directory-sync/src/lib/file-operations.ts` | 2     | Convert 19 sync FS calls to async        |
| `plugins/directory-sync/src/lib/seed-content.ts`    | 2     | Convert sync FS to async                 |
| `plugins/directory-sync/src/lib/quarantine.ts`      | 2     | Convert sync FS to async                 |
| `plugins/directory-sync/src/lib/git-sync.ts`        | 2     | Convert sync FS to async                 |
| `plugins/directory-sync/src/handlers/*-handler.ts`  | 2     | Convert readFileSync/writeFileSync       |
| `shell/job-queue/src/worker-job-runner.ts`          | 3     | Create worker manager                    |
| `shell/job-queue/src/worker-entry.ts`               | 3     | Create worker script                     |
| `shell/job-queue/src/job-queue-worker.ts`           | 3     | Add worker dispatch                      |
