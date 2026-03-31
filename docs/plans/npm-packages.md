# Plan: @rizom/brain

## Prerequisites

Requires **Bun >= 1.3.3**. Node.js/npm support is a future possibility but not planned.

## Goal

```bash
bun add -g @rizom/brain
brain init mybrain --model rover
cd mybrain
brain start
```

One package. CLI and runtime in the same process.

## Architecture

Single Bun build. The CLI _is_ the runtime — no subprocess, no IPC, no spawn.

```
@rizom/brain
  dist/brain.js (~7MB, Bun target)
    ├── CLI commands (init, start, list, eval, --remote)
    ├── Runtime (shell, plugins, entities, sites, themes)
    └── Models (rover, ranger, relay — defineBrain() configs)
```

`brain start` imports the model and calls `App.create(config).run()` directly. Same process, same event loop. This means:

- **Zero spawn overhead** — no child process for start, list, sync, build
- **Plugins are just code** — third-party plugins import from `@rizom/brain`, no serialization boundaries
- **One build artifact** — single `dist/brain.js` with everything

```yaml
# brain.yaml
brain: rover # built-in model
preset: default # named capability subset (minimal, default, pro)
```

## What's in an instance

```
mybrain/
  brain.yaml        # model + config
  .env              # secrets
  .gitignore
  brain-data/       # entities as markdown (managed by directory-sync)
  data/             # SQLite databases (auto-created)
  package.json      # optional — only when version is pinned or external plugins added
```

By default, no `package.json`. Uses the globally installed `@rizom/brain`. For production or reproducibility, `brain pin` creates a `package.json` that locks to a specific version:

```bash
brain pin              # pins to currently installed version
brain pin 1.2.0        # pins to specific version
```

```json
{
  "private": true,
  "dependencies": {
    "@rizom/brain": "1.2.0"
  }
}
```

`brain start` prefers local install over global. No `package.json` → global (dev mode). Has `package.json` → local pinned version (production mode).

**Implementation details:**

- `brain pin` auto-installs after creating package.json — creating the file without installing is useless
- `brain start` checks for `./node_modules/@rizom/brain` — if found, re-execs with the local binary instead of continuing with the global one. Same pattern as eslint, typescript, jest. Silent version mismatches are the worst kind of bug.

## What's implemented

### CLI (done)

- `brain init <dir>` — scaffolds brain.yaml, .env.example, .gitignore
- `brain start` — boots brain (monorepo, Docker, or built-in models)
- `brain chat` — starts with interactive chat REPL
- `brain eval` — runs evaluations
- `brain list/get/search/sync/build/status` — headless tool invocation
- `brain <command> --remote <url>` — queries deployed brain via MCP HTTP
- `brain tool <name> <json>` — raw tool invocation
- Schema-driven argument mapping from tool inputSchema

### Build infrastructure (done)

- `build-model.ts` bundles brain model + all workspace code into single JS file
- All site packages bundled (any instance can use any site)
- Migrations, seed content copied to dist

### In-process webserver (done)

- Hono servers run via Bun.serve() directly — no child process
- Works in monorepo, Docker, and npm bundle

## What's left

### Phase 1: Single in-process package

Merge CLI + runtime + models into one Bun build.

#### Two runner paths

1. **Monorepo** — detect `bun.lock` + `shell/app/src/runner.ts` → run from source. Needed for development (hot reload, source maps, workspace deps).
2. **Everything else** — in-process boot from built-in models. Docker, npm global, standalone — all the same code path. `brain start` imports the model and calls `App.create(config).run()` directly.

The current Docker path (`dist/.model-entrypoint.js`) becomes legacy. Docker images will eventually install `@rizom/brain` and run `brain start` like any other instance. During transition, the old Docker entrypoint is detected as a fallback.

#### Steps

1. New build script: single `bun build` targeting Bun, bundles CLI + all brain models + runtime
2. Model registry: `brain start` reads `brain: rover` from yaml, resolves to built-in `defineBrain()` export
3. `brain start` boots in-process — imports model, calls `App.create(config).run()`
4. `brain list/sync/build` boots headless in-process — no subprocess
5. `brain init` scaffolds brain.yaml only (no package.json by default)
6. `brain.yaml` uses `brain: rover` (not `brain: "@brains/rover"`)
7. `brain pin` creates package.json pinning `@rizom/brain` to current (or specified) version
8. `brain start` prefers local install (package.json) over global
9. Native deps as `optionalDependencies` (sharp, libsql, fastembed, etc.)
10. Publish to npm
11. Test: `bun add -g @rizom/brain && brain init mybrain && cd mybrain && brain start`

### Phase 2: Deploy scaffolding (done)

```bash
brain init mybrain --model rover --deploy
```

Adds deploy.yml, Kamal hooks, CI workflow. Already implemented via `--deploy` flag.

### Phase 3: External plugins

For users who need plugins beyond what rover/ranger/relay ship with. All config stays in YAML.

#### How it works

```yaml
# brain.yaml
brain: rover
plugins:
  - @rizom/brain-plugin-calendar
  - @rizom/brain-plugin-stripe:
      apiKey: "${STRIPE_API_KEY}"
```

`brain start` resolves plugin names from `node_modules` and loads them alongside the built-in model's capabilities. Env var interpolation (`${...}`) works in plugin config values.

**Build detail:** The bundled `dist/brain.js` can't resolve `node_modules` at bundle time. External plugins must be loaded via dynamic `import()` at runtime, not statically bundled. This works because Bun resolves dynamic imports from `node_modules` — the build script just needs to ensure plugin imports aren't caught by the bundler.

```
mybrain/
  brain.yaml          # model + plugin config
  package.json        # dependencies (auto-created when plugins are added)
  node_modules/       # npm plugins live here
  .env                # secrets
  brain-data/
  data/
```

`package.json` and `node_modules` only appear when external plugins are added. Built-in model users never see them.

#### Plugin anatomy

A published plugin is just an npm package:

```
@rizom/brain-plugin-calendar/
  package.json          # peerDependency on @rizom/brain
  src/
    index.ts            # exports plugin factory
    schema.ts           # Zod schema for the entity (if EntityPlugin)
    adapter.ts          # markdown adapter (if EntityPlugin)
    tools.ts            # tool definitions (if ServicePlugin)
```

```json
{
  "name": "@rizom/brain-plugin-calendar",
  "peerDependencies": {
    "@rizom/brain": "^1.0.0"
  }
}
```

```typescript
// index.ts
import { ServicePlugin, createTool, z } from "@rizom/brain";

export const calendarPlugin = ServicePlugin.create({
  id: "calendar",
  name: "Calendar",
  configSchema: z.object({ ... }),
  tools: [ ... ],
  onRegister: async (context) => { ... },
});
```

#### What `@rizom/brain` exports vs what stays internal

| Exported (public API)                                     | Internal to shell                            |
| --------------------------------------------------------- | -------------------------------------------- |
| EntityPlugin, ServicePlugin, InterfacePlugin base classes | Shell, App, plugin loading/resolution        |
| Context interfaces (read-only view)                       | Context implementation, dependency injection |
| Tool types, createTool, toolSuccess/toolError             | Tool registry, MCP transport                 |
| Zod, Logger, ProgressReporter types                       | EntityService internals, job queue impl      |
| Entity schema/adapter helpers                             | Database, migrations, sync                   |
| Messaging types (subscribe, send)                         | Message bus implementation                   |

This is a contract. Shell internals can change without breaking external plugins as long as the contract holds.

> For programmatic brain definitions (`brain.ts`, `defineBrain()`, preset composition), see [custom-brain-definitions.md](./custom-brain-definitions.md).

### Phase 4: Runtime site/theme overrides

```yaml
brain: rover
site: "@rizom/site-portfolio" # npm package
theme: "./theme.css" # local CSS file
```

Custom sites need `package.json` + `node_modules`. Theme-only overrides work with just a local CSS file.

### Phase 5: Plugin discovery

```bash
brain search calendar
# → @rizom/brain-plugin-calendar  Calendar events and scheduling
# → @community/brain-plugin-gcal  Google Calendar sync

brain add @rizom/brain-plugin-calendar
# Installs package + adds to brain.yaml plugins list
```

Convention: plugins are npm packages named `brain-plugin-*` or `@scope/brain-plugin-*`. The CLI searches npm for packages matching this pattern.

`brain add` does two things:

1. `bun add @rizom/brain-plugin-calendar` (creates `package.json` if needed)
2. Adds entry to `plugins:` list in `brain.yaml`

Users can also edit `brain.yaml` manually and run `bun install` themselves.

## Verification

1. `bun add -g @rizom/brain` installs on any machine with Bun >= 1.3.3
2. `brain init mybrain` creates brain.yaml + .env.example (no package.json)
3. `brain start` boots rover in-process from global install
4. `brain pin` creates package.json with pinned version
5. `brain start` (with package.json) uses local pinned version over global
6. `brain list posts` runs headless in-process
7. `brain list posts --remote rover.rizom.ai` queries deployed brain
8. `brain init mybrain --deploy` adds deploy files
9. `brain eval` runs model evaluations
10. External plugin: add to `brain.yaml` plugins list + `bun add` → plugin loads and provides tools
11. Public API: external plugins import base classes and types from `@rizom/brain`
