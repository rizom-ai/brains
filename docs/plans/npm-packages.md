# Plan: @rizom/brain

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
brain: rover
preset: default
```

```typescript
// Future: custom brain with third-party plugins
import { defineBrain } from "@rizom/brain";
import { myPlugin } from "./my-plugin";

export default defineBrain({
  name: "custom",
  capabilities: [["my-plugin", myPlugin, {}]],
});
```

## What's in an instance

```
mybrain/
  brain.yaml        # model + config
  .env              # secrets
  .gitignore
  brain-data/       # entities (managed by directory-sync)
  data/             # databases (auto-created)
```

No `package.json`. No `node_modules`. Pure config + data. Everything else is in the global `@rizom/brain` install.

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

1. New build script: single `bun build` targeting Bun, bundles CLI + all brain models + runtime
2. Model registry: `brain start` reads `brain: rover` from yaml, resolves to built-in `defineBrain()` export
3. `brain start` boots in-process — imports model, calls `App.create(config).run()`
4. `brain list/sync/build` boots headless in-process — no subprocess
5. `brain init` scaffolds brain.yaml only (no package.json, no node_modules)
6. `brain.yaml` uses `brain: rover` (not `brain: "@brains/rover"`)
7. Native deps as `optionalDependencies` (sharp, libsql, fastembed, etc.)
8. Publish to npm
9. Test: `bun add -g @rizom/brain && brain init mybrain && cd mybrain && brain start`

### Phase 2: Deploy scaffolding (done)

```bash
brain init mybrain --model rover --deploy
```

Adds deploy.yml, Kamal hooks, CI workflow. Already implemented via `--deploy` flag.

### Phase 3: Custom brain definitions (medium-term)

For users who need custom plugins beyond the built-in models:

```yaml
brain: ./brain.ts # local definition file instead of built-in model
```

```typescript
// brain.ts
import { defineBrain } from "@rizom/brain";
import { myPlugin } from "./plugins/my-plugin";

export default defineBrain({
  name: "custom",
  capabilities: [["my-plugin", myPlugin, {}]],
});
```

This requires a `package.json` + `node_modules` (for the import). But most users use built-in models and never need this.

### Phase 4: Runtime site/theme overrides (medium-term)

```yaml
brain: rover
site: "@mysites/portfolio" # npm package
theme: "./theme.css" # local CSS file
```

Custom sites need `package.json` + `node_modules`. Theme-only overrides work with just a local CSS file.

## Verification

1. `bun add -g @rizom/brain` installs on any machine with Bun
2. `brain init mybrain` creates brain.yaml + .env.example (no package.json)
3. `brain start` boots rover in-process from built-in bundle
4. `brain list posts` runs headless in-process
5. `brain --remote rover.rizom.ai` queries deployed brain
6. `brain init mybrain --deploy` adds deploy files
7. `brain eval` runs model evaluations
8. Third-party plugins import from `@rizom/brain` (future)
