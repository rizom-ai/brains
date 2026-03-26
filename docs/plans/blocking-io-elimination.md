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

## Phase 3: Child process for site builds

### Why it's needed

Site builds are CPU-bound: Preact `render()` is synchronous per route, Tailwind PostCSS processing is one long blocking chunk. Even though `SiteBuilder.build()` is async, the CPU work inside doesn't yield — it blocks the event loop for the duration of each `render()` call and the entire CSS processing step. With 40+ routes and Tailwind, this is 10-60s of degraded responsiveness for MCP/Discord/A2A.

The build is already behind a 5s debounce and runs via the job queue, so it's infrequent. But when it runs, it monopolizes the CPU.

### Approach: Not like Phase 1

Phase 1 moved the webserver to a standalone script with zero brain dependencies. A site build is fundamentally different — it needs the full plugin context:

- **EntityService** — reads entities for every route
- **TemplateRegistry + DataSourceRegistry** — resolves content for sections
- **RouteRegistry** — knows what routes to build
- **ViewRegistry** — gets view templates for rendering
- **SiteInfoService + AnchorProfileService** — builds site metadata
- **UISlotRegistry** — renders plugin-registered UI components (newsletter CTA)
- **Layouts, theme CSS** — from the site package

All of these are populated during the plugin lifecycle (`onRegister`). A standalone script can't get them without running the full brain startup.

### Design: `Bun.spawn()` with the brain runner

Instead of a standalone script, the child process is the **same brain runner** (`shell/app/src/runner.ts`) with a `--build-only` flag. It:

1. Loads `brain.yaml`, resolves the brain definition, runs the full plugin lifecycle — same as normal startup
2. Skips interface startup (no MCP, Discord, A2A, webserver daemons)
3. Skips the job queue worker (no polling)
4. Runs one site build directly after `sync:initial:completed`
5. Reports progress + result via structured JSON lines on stdout
6. Exits

This means the child process uses the same code paths as a normal build — no headless context stubs, no serialization boundary, no slot migration. The only difference is it starts up, builds, and shuts down.

### Startup path

```
runner.ts --build-only --environment preview --output-dir ./dist/site-preview
  ↓
handleCLI() detects --build-only
  ↓
App.initialize()  — full plugin lifecycle (but no interfaces registered)
  ↓
Skip App.start()  — no signal handlers, no "keep process alive"
  ↓
Wait for sync:initial:completed (entities loaded from disk)
  ↓
Get site-builder plugin, call siteBuilder.build() directly
  ↓
Print JSON result to stdout
  ↓
process.exit(0)
```

### What to skip

The child process needs to skip:

- **All interfaces** — no MCP, Discord, A2A, webserver
- **Job queue worker** — no polling for jobs
- **Auto-rebuild subscriptions** — no entity event listeners
- **Git periodic sync** — no interval timers

It still needs:

- **All entity plugins** — their schemas, adapters, datasources are needed for content resolution
- **Site-builder plugin** — the builder itself
- **Directory-sync plugin** — to populate entities from disk (initial sync)
- **Layout/site plugin** — templates, routes, datasources

The simplest way: pass all the same plugins but no interfaces. The existing preset system already supports this — `interfaces` is a separate array from `capabilities` in `BrainDefinition`.

### Communication protocol

Stdout JSON lines, same as we proposed earlier:

```jsonl
{"type":"progress","progress":25,"total":100,"message":"Building routes"}
{"type":"progress","progress":90,"total":100,"message":"Generating CSS"}
{"type":"complete","success":true,"routesBuilt":42,"outputDir":"./dist/site-preview","environment":"preview"}
```

Or on failure:

```jsonl
{
  "type": "error",
  "error": "Tailwind CSS processing failed",
  "stack": "..."
}
```

The parent (`SiteBuildJobHandler`) spawns the child, reads stdout line-by-line, forwards progress to `ProgressReporter`, and emits `site:build:completed` on completion. The child doesn't emit that event — it just exits.

### Post-build events stay on the parent

`site:build:completed` triggers SEO file generation (sitemap, robots.txt, CMS config) and RSS feed generation. These run on the parent process where the messaging system lives. The child just produces the HTML files.

### Startup overhead

Full brain resolve + plugin init is heavier than Phase 1's standalone script. Expected: 500ms-2s depending on how many plugins init. For a 10-60s build, this is acceptable. The 5s debounce already absorbs more than this.

To validate: measure actual startup time in the `--build-only` path before and after implementing.

### Implementation steps

**Step 1: Add `--build-only` to CLI** (small)

- `shell/app/src/cli.ts` — detect `--build-only`, parse `--environment` and `--output-dir` args
- `shell/app/src/app.ts` — add `buildOnly()` method: initialize without interfaces, run build, exit
- The brain resolver already separates capabilities from interfaces — pass empty interfaces array

**Step 2: Build execution in child** (medium)

- After `initialize()`, wait for `sync:initial:completed` (directory-sync loads entities)
- Get the site-builder plugin instance from the plugin manager
- Call `siteBuilder.build()` with the right options
- Write progress + result as JSON lines to stdout
- Exit

**Step 3: Parent spawns child** (medium)

- `SiteBuildJobHandler` gains a `useChildProcess` option
- When enabled, spawns `bun run <entrypoint> --build-only --environment <env> --output-dir <dir>`
- Reads stdout line-by-line, forwards progress
- On exit code 0 + `complete` message, emits `site:build:completed`
- On non-zero exit or `error` message, fails the job
- Timeout: 5 minutes

**Step 4: Skip unnecessary init in child** (small)

- Add a `buildOnly` flag to `AppConfig` or `ShellConfig`
- Shell skips starting the job queue worker when `buildOnly` is set
- Site-builder plugin skips auto-rebuild subscription when `buildOnly` is set
- Directory-sync skips periodic git sync and auto-commit when `buildOnly` is set

### Files

| File                                                       | Step | Action                            |
| ---------------------------------------------------------- | ---- | --------------------------------- |
| `shell/app/src/cli.ts`                                     | 1    | Parse `--build-only` + args       |
| `shell/app/src/app.ts`                                     | 1, 2 | `buildOnly()` method              |
| `shell/app/src/types.ts`                                   | 1    | Add `buildOnly` to AppConfig      |
| `plugins/site-builder/src/handlers/siteBuildJobHandler.ts` | 3    | Spawn child process option        |
| `plugins/site-builder/src/plugin.ts`                       | 4    | Skip auto-rebuild when buildOnly  |
| `plugins/directory-sync/src/plugin.ts`                     | 4    | Skip periodic sync when buildOnly |

### Verify

1. `bun run <entrypoint> --build-only --environment preview --output-dir ./dist/site-preview` produces a valid site
2. Trigger build via MCP tool — parent spawns child, MCP stays responsive during build
3. `site:build:completed` fires, SEO files + RSS generated
4. Newsletter CTA present in built pages
5. Measure startup overhead of `--build-only` path

## Files

| File                                                       | Phase | Action                               |
| ---------------------------------------------------------- | ----- | ------------------------------------ |
| `interfaces/webserver/src/standalone-server.ts`            | 1 ✅  | New: child process entry point       |
| `interfaces/webserver/src/server-manager.ts`               | 1 ✅  | Spawn child, remove API mounting     |
| `interfaces/webserver/src/api-server.ts`                   | 1 ✅  | New: API route server on main thread |
| `interfaces/webserver/src/webserver-interface.ts`          | 1 ✅  | Start child + API server in daemon   |
| `interfaces/webserver/src/config.ts`                       | 1 ✅  | Add apiPort config                   |
| `deploy/providers/hetzner/templates/Caddyfile.template`    | 1 ✅  | Route /api/\* to :3335               |
| `plugins/directory-sync/src/lib/file-operations.ts`        | 2 ✅  | Convert 19 sync FS calls to async    |
| `plugins/directory-sync/src/lib/seed-content.ts`           | 2 ✅  | Convert sync FS to async             |
| `plugins/directory-sync/src/lib/quarantine.ts`             | 2 ✅  | Convert sync FS to async             |
| `plugins/directory-sync/src/lib/git-sync.ts`               | 2 ✅  | Convert sync FS to async             |
| `plugins/directory-sync/src/handlers/*-handler.ts`         | 2 ✅  | Convert readFileSync/writeFileSync   |
| `shell/app/src/cli.ts`                                     | 3     | Parse --build-only + args            |
| `shell/app/src/app.ts`                                     | 3     | buildOnly() method                   |
| `shell/app/src/types.ts`                                   | 3     | Add buildOnly to AppConfig           |
| `plugins/site-builder/src/handlers/siteBuildJobHandler.ts` | 3     | Spawn child process option           |
| `plugins/site-builder/src/plugin.ts`                       | 3     | Skip auto-rebuild when buildOnly     |
| `plugins/directory-sync/src/plugin.ts`                     | 3     | Skip periodic sync when buildOnly    |
