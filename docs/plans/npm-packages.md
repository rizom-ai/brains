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
  dist/brain.js (~6MB, Bun target)
    ├── CLI commands (init, start, list, eval, --remote)
    ├── Runtime (shell, plugins, entities, sites, themes)
    └── Models (rover + ranger + relay bundled for runtime compatibility)
```

**Bundled model set:** `@rizom/brain` must bundle every in-tree brain model that a scaffolded or checked-in app instance can declare in `brain.yaml`. That currently means `rover`, `ranger`, and `relay`. `rover` remains the public reference model, but `ranger` and `relay` also ship in the runtime package so published-path app instances like `apps/rizom-ai` and `apps/rizom-foundation` can boot without depending on monorepo source resolution.

**Bundled package refs:** the published runtime must also pre-register the built-in site/theme package refs that checked-in and scaffolded apps use in `brain.yaml` (for example `@brains/site-default`, `@brains/theme-default`, `@brains/site-rizom`, `@brains/theme-rizom`). In bundled mode these refs must resolve from the in-memory package registry, not via runtime dynamic import, because a pure `bunx @rizom/brain ...` install does not carry separate workspace packages beside the published bundle.

`brain start` imports the model and calls `App.create(config).run()` directly. Same process, same event loop. This means:

- **Zero spawn overhead** — no child process for start, list, sync, build
- **Plugins are just code** — third-party plugins import from `@rizom/brain`, no serialization boundaries
- **One build artifact** — single `dist/brain.js` with everything

```yaml
# brain.yaml
brain: rover
preset: default
```

### Two runner paths

1. **Monorepo** — detect `bun.lock` + `shell/app/src/runner.ts` → run from source. Development only.
2. **Everything else** — in-process boot from built-in models. Docker, npm global, standalone — all the same code path.

The current Docker path (`dist/.model-entrypoint.js`) becomes legacy. Docker images will eventually install `@rizom/brain` and run `brain start`.

## What's in an instance

A fresh instance scaffold is now a lightweight package boundary, not only a bare config dir.

```
mybrain/
  brain.yaml
  .env.example
  .gitignore
  README.md
  tsconfig.json
  package.json
  src/
    site.ts
    theme.css
  brain-data/       # entities as markdown (managed by directory-sync)
  data/             # SQLite databases (auto-created)
```

Deploy scaffolds add repo-local deploy assets on top of that.

`brain pin` still matters for already-existing dirs or for explicitly re-pinning a local install, but the standard `brain init` path now writes `package.json` up front.

**Implementation details:**

- `brain pin` auto-installs after creating package.json
- `brain start` checks for `./node_modules/@rizom/brain` — if found, re-execs with the local binary instead of continuing with the global one

## What's done

### CLI ✅

- `brain init <dir>` — scaffolds `brain.yaml`, `.env.example`, `.gitignore`, `README.md`, `tsconfig.json`, `package.json`, and local `src/site.ts` / `src/theme.css` convention files
- `brain init <dir> --deploy` — adds `config/deploy.yml`, Kamal hook, repo-local deploy assets, and publish/deploy CI workflows
- `brain start` — dual-path boot (monorepo subprocess + bundled in-process)
- `brain chat` — interactive chat REPL
- `brain eval` — evaluation pass-through
- `brain list/get/search/sync/build/status` — headless tool invocation (in-process for bundled, subprocess for monorepo)
- `brain <command> --remote <url>` — remote MCP HTTP queries
- `brain tool <name> <json>` — raw tool invocation
- Schema-driven argument mapping from tool inputSchema
- Model registry with `registerModel()` / `getModel()` / `setBootFn()`

### Build ✅

- `scripts/build.ts` bundles CLI + all brain models + runtime into `dist/brain.js` (~6MB)
- `scripts/entrypoint.ts` registers rover + boot function + runs CLI
- All site packages bundled (any instance can use any site)
- Migrations + seed content copied to dist
- optionalDependencies for native platform binaries (sharp, libsql, etc.)

### In-process webserver ✅

- Hono servers run via Bun.serve() directly — no child process
- Works in monorepo, Docker, and npm bundle

### registerOnly mode fix ✅

- Daemons skip start in registerOnly mode (webserver, MCP, A2A stay stopped)
- Headless commands (list, status, sync) boot fast without side effects

### brain.yaml bare names ✅

- `brain: rover` instead of `brain: "@brains/rover"`
- `resolveModelName()` handles both formats (backward compat)
- All configs, docs, READMEs updated

## What's left

Public alpha publishing is already live. The remaining work here is no longer "can we publish `@rizom/brain` at all?" It is finishing the path from alpha to stable, while keeping the published package aligned with the standalone operator contract.

### Remaining work

1. keep the published CLI/docs/examples aligned with the shipped standalone scaffold shape
2. keep bundled model/package-ref coverage correct for all supported in-tree app definitions
3. continue expanding library exports needed by external-plugin and standalone authoring work
4. carry the current alpha path through clean-machine smoke testing and stable `v0.1.0` release staging

### Shipped milestones

- public alpha publishing for `@rizom/brain`
- in-process runtime boot from published package
- `brain init` full lightweight-instance scaffold
- `brain init --deploy` publish/deploy scaffold
- `brain pin` and local-over-global re-exec
- standalone site/theme authoring exports under `@rizom/brain/site`
- theme helpers under `@rizom/brain/themes`

### Still split into separate plans

- external plugin API: [external-plugin-api.md](./external-plugin-api.md)
- broader release staging / public launch cleanup: [public-release-cleanup.md](./public-release-cleanup.md)

### Runtime site/theme overrides

```yaml
brain: rover
site: "@rizom/site-portfolio"
theme: "./theme.css"
```

Custom sites need `package.json` + `node_modules`. Theme-only overrides work with just a local CSS file.

## Verification

1. `bun add -g @rizom/brain` installs on any machine with Bun >= 1.3.3
2. `brain init mybrain` creates `brain.yaml`, `.env.example`, and the local support files for a lightweight instance package (including `package.json`)
3. `brain start` boots rover in-process from built-in bundle
4. `brain list posts` runs headless in-process without starting daemons
5. `brain list posts --remote rover.rizom.ai` queries deployed brain
6. `brain init mybrain --deploy` adds deploy files
7. `brain eval` runs model evaluations
8. `brain pin` creates package.json with pinned version
9. `brain start` (with package.json) uses local pinned version over global
