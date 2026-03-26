# Plan: Eliminate Blocking I/O from Runtime

## Context

The brain runs everything on one thread: webserver, MCP, Discord, A2A, site builds, directory sync. The webserver is the biggest offender — it handles every HTTP request (static files, clean URL resolution, 404s) on the same event loop that processes agent conversations.

## Phase 1: Move webserver to child process

**Problem**: The webserver (`Bun.serve()` + Hono) handles all HTTP traffic on the main thread. Every static file request, every `existsSync` call in clean URL resolution, every site page serve competes with MCP/Discord/A2A message handling.

**Insight**: The webserver is a pure static file server with API route proxying. It doesn't need the plugin context, entity service, or message bus. It only needs:

- Two directory paths (production + preview dist dirs)
- Two ports to listen on
- The main brain's MCP/A2A ports to reverse-proxy API routes

**Fix**: Spawn the webserver as a `Bun.spawn()` child process.

```
Main thread (brain)              Child process (webserver)
├── MCP server (:3333)           ├── Production site (:8080)
├── A2A server (:3334)           ├── Preview site (:4321)
├── Discord bot                  ├── /mcp → proxy to :3333
├── Site builder (job queue)     ├── /a2a → proxy to :3334
└── Directory sync               └── Static files from dist/
```

The child process is a lightweight script:

1. Receives config via CLI args or env: dist dirs, ports, proxy targets
2. Serves static files (can use `existsSync` freely — own thread)
3. Reverse-proxies `/mcp`, `/a2a`, `/.well-known/agent-card.json` to the main process
4. Handles clean URLs, 404s, cache headers — all independently

**Benefits**:

- MCP/Discord/A2A never blocked by HTTP traffic
- Site builds don't affect page serving (files are on disk)
- `existsSync` in route rewriting is fine (own event loop)
- Webserver crash doesn't kill the brain
- No need to convert sync FS calls to async (Phase 1 of old plan eliminated)

**Files**:

- `interfaces/webserver/src/standalone-server.ts` — new: standalone entry point for child process
- `interfaces/webserver/src/server-manager.ts` — spawn child process instead of running in-process
- `interfaces/webserver/src/proxy.ts` — new: reverse proxy for API routes

**Verify**: Start brain, verify site serves, verify MCP/A2A remain responsive under load

## Phase 2: Directory-sync async FS conversion

**Problem**: `FileOperations` class uses 19 sync FS calls — blocks during entity import/export. With the webserver off the main thread, this is the remaining sync bottleneck.

**Fix**: Convert sync calls to `fs/promises` equivalents. Mechanical conversion — methods are already async, callers are in async contexts.

**Files**:

- `plugins/directory-sync/src/lib/file-operations.ts` — core (19 calls)
- `plugins/directory-sync/src/lib/seed-content.ts`
- `plugins/directory-sync/src/lib/quarantine.ts`
- `plugins/directory-sync/src/lib/git-sync.ts`
- `plugins/directory-sync/src/handlers/*-handler.ts`

**Verify**: `bun test plugins/directory-sync/`

## Phase 3: Child process for site builds (if needed)

With the webserver in its own process, site builds blocking the main thread may be tolerable — MCP/Discord/A2A are async I/O that yield between messages, and builds are infrequent. Monitor first before adding complexity.

If still needed: `Bun.spawn()` with `--build-only` flag, same approach as Phase 1. The brain already has a build entrypoint. ~50ms startup overhead on a 10-60s build.

## Files

| File                                                | Phase | Action                             |
| --------------------------------------------------- | ----- | ---------------------------------- |
| `interfaces/webserver/src/standalone-server.ts`     | 1     | New: child process entry point     |
| `interfaces/webserver/src/server-manager.ts`        | 1     | Spawn child instead of in-process  |
| `interfaces/webserver/src/proxy.ts`                 | 1     | New: reverse proxy for API routes  |
| `plugins/directory-sync/src/lib/file-operations.ts` | 2     | Convert 19 sync FS calls to async  |
| `plugins/directory-sync/src/lib/seed-content.ts`    | 2     | Convert sync FS to async           |
| `plugins/directory-sync/src/lib/quarantine.ts`      | 2     | Convert sync FS to async           |
| `plugins/directory-sync/src/lib/git-sync.ts`        | 2     | Convert sync FS to async           |
| `plugins/directory-sync/src/handlers/*-handler.ts`  | 2     | Convert readFileSync/writeFileSync |
