# Plan: Eliminate Blocking I/O from Runtime

## Context

The brain runs everything on one thread: webserver, MCP, Discord, A2A, site builds, directory sync. The webserver is the biggest offender — it handles every HTTP request (static files, clean URL resolution, 404s) on the same event loop that processes agent conversations.

## Architecture: Stateless vs Stateful Interfaces

Interfaces split into two categories:

**Stateless (no brain access):**

- **Webserver** — serves static files from disk. Zero coupling to plugins, entities, or messaging.

**Stateful (deep brain access):**

- **MCP** — every tool call goes through the tool registry, plugin context, entity service
- **A2A** — routes tasks to `agentService`, which calls tools, reads entities, manages conversations
- **Discord/Matrix** — same as A2A, but via chat
- **API routes** — calls `messageBus.send()` to invoke plugin tools (e.g., newsletter subscribe)

Stateful interfaces are inherently async I/O — they don't block the event loop. They only touch the brain when a request arrives, and that work (tool execution, AI inference) must happen on the main thread where the plugin context, DB connection, and entity service live. Moving them to child processes would require an IPC/RPC layer to proxy every call back, for no real gain.

The webserver is the one exception — it's purely serving files and competes with everything else for the event loop. It's the ideal child process candidate.

## Phase 1: Move webserver to child process, API to own port

**Problem**: The webserver (`Bun.serve()` + Hono) handles all HTTP traffic on the main thread. Every static file request, every `existsSync` call in clean URL resolution, every page serve competes with MCP/Discord/A2A message handling. API routes (`/api/*`) are also mounted on the webserver, coupling them to the static file server.

**Fix**:

1. Move the webserver to a `Bun.spawn()` child process — it becomes a pure static file server
2. Move API routes to their own port on the main process — they need `messageBus` but not the webserver
3. Update Caddy templates to route `/api/*` to the new port

```
Main process (brain)                Child process (webserver)
├── MCP         (:3333)             ├── Production site (:8080)
├── A2A         (:3334)             └── Preview site    (:4321)
├── API routes  (:3335)  ← NEW
├── Discord bot
├── Site builder (job queue)
└── Directory sync
```

**The child process is a lightweight standalone script:**

1. Receives config via CLI args or env: dist dirs, ports, shared images dir
2. Serves static files with clean URLs, cache headers, 404 handling
3. Can use `existsSync` freely — own event loop, no contention
4. No connection to the brain. No imports from shell/plugins. Minimal dependencies (Hono + Bun).

**API routes move to a dedicated server on the main process:**

Currently there's one API route: `POST /api/buttondown/subscribe`. It calls `messageBus.send()` to invoke the `buttondown_subscribe` tool. This stays on the main thread but gets its own Hono app + `Bun.serve()` on port 3335, using the existing `createApiRouteHandler` + `mountApiRoutes` code from `server-manager.ts`.

**Caddy changes:**

```
# Current
handle { reverse_proxy personal-brain:8080 }

# New
handle /api/* { reverse_proxy personal-brain:3335 }
handle { reverse_proxy personal-brain:8080 }
```

MCP (`:3333`) and A2A (`:3334`) routes unchanged.

**Benefits**:

- MCP/Discord/A2A never blocked by HTTP traffic
- Site builds don't affect page serving (files are on disk)
- Webserver crash doesn't kill the brain
- API routes isolated from static file serving — cleaner separation of concerns
- Each port serves one purpose: static files, MCP, A2A, API

**Files**:

- `interfaces/webserver/src/standalone-server.ts` — new: child process entry point (pure static file server)
- `interfaces/webserver/src/server-manager.ts` — spawn child process instead of in-process, remove API route mounting
- `interfaces/webserver/src/api-server.ts` — new: dedicated API route server on main thread (:3335)
- `interfaces/webserver/src/webserver-interface.ts` — start child process + API server in daemon
- `interfaces/webserver/src/config.ts` — add `apiPort` config field
- `deploy/providers/hetzner/templates/Caddyfile.template` — route `/api/*` to `:3335`

**Verify**: Start brain, verify site serves on :8080, API works on :3335, MCP/A2A remain responsive under load

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

If still needed: `Bun.spawn()` with `--build-only` flag, same approach as Phase 1. The brain already has a build entrypoint. ~200-500ms startup overhead on a 10-60s build.

## Files

| File                                                    | Phase | Action                               |
| ------------------------------------------------------- | ----- | ------------------------------------ |
| `interfaces/webserver/src/standalone-server.ts`         | 1     | New: child process entry point       |
| `interfaces/webserver/src/server-manager.ts`            | 1     | Spawn child, remove API mounting     |
| `interfaces/webserver/src/api-server.ts`                | 1     | New: API route server on main thread |
| `interfaces/webserver/src/webserver-interface.ts`       | 1     | Start child + API server in daemon   |
| `interfaces/webserver/src/config.ts`                    | 1     | Add apiPort config                   |
| `deploy/providers/hetzner/templates/Caddyfile.template` | 1     | Route /api/\* to :3335               |
| `plugins/directory-sync/src/lib/file-operations.ts`     | 2     | Convert 19 sync FS calls to async    |
| `plugins/directory-sync/src/lib/seed-content.ts`        | 2     | Convert sync FS to async             |
| `plugins/directory-sync/src/lib/quarantine.ts`          | 2     | Convert sync FS to async             |
| `plugins/directory-sync/src/lib/git-sync.ts`            | 2     | Convert sync FS to async             |
| `plugins/directory-sync/src/handlers/*-handler.ts`      | 2     | Convert readFileSync/writeFileSync   |
