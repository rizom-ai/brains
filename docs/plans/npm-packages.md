# Plan: @rizom/brain

## Goal

```bash
npm install -g @rizom/brain
brain init mybrain --model rover
cd mybrain
brain start
```

One package. CLI, runtime, and all brain models.

## Architecture

```
@rizom/brain
  ├── CLI (brain init, brain start, brain eval, --remote)
  ├── Runtime (shell, plugins, entities, sites, themes)
  └── Models (rover, ranger, relay — defineBrain() configs)
```

`brain.yaml` references models by name, not npm package:

```yaml
brain: rover # not "@brains/rover"
preset: default
```

The package resolves the model internally — no dependency installation needed in the instance directory. `brain start` just works.

## What's in an instance

```
mybrain/
  brain.yaml        # model + config
  .env              # secrets
  .gitignore
  brain-data/       # entities (managed by directory-sync)
  data/             # databases (auto-created)
```

No `package.json`. No `node_modules`. The instance is pure config + data. The CLI has everything built in.

## What's implemented

### CLI (done)

- `brain init <dir>` — scaffolds brain.yaml, .env.example, .gitignore
- `brain start` — boots brain (monorepo, Docker, or npm path)
- `brain chat` — starts with interactive chat REPL
- `brain eval` — runs evaluations
- `brain list/get/search/sync/build/status` — headless tool invocation
- `brain <command> --remote <url>` — queries deployed brain via MCP HTTP
- `brain tool <name> <json>` — raw tool invocation
- Schema-driven argument mapping from tool inputSchema
- Node-compatible (no Bun APIs in CLI source)

### Build (done)

- `build-model.ts` bundles brain model + all workspace code into single JS file
- All site packages bundled (any instance can use any site)
- Migrations, seed content copied to dist

### In-process webserver (done)

- Hono servers run via Bun.serve() directly — no child process
- Works in monorepo, Docker, and npm bundle

## What's left

### Phase 1: Single package

Merge CLI + runtime + models into `@rizom/brain`.

1. Bundle all brain models (rover, ranger, relay) into the CLI build
2. `brain init` no longer scaffolds `package.json` — instances are just brain.yaml
3. `brain start` resolves model by name from built-in registry, not npm
4. `brain.yaml` uses `brain: rover` (not `brain: "@brains/rover"`)
5. Build script produces single `@rizom/brain` package with CLI bin + runtime
6. Publish to npm
7. Test: `npm install -g @rizom/brain && brain init mybrain && cd mybrain && brain start`

### Phase 2: Deploy scaffolding

Deploy files are opt-in:

```bash
brain init mybrain --model rover --deploy
```

Adds deploy.yml, Kamal hooks, CI workflow. Already implemented, just needs the `--deploy` flag (done).

### Phase 3: Runtime site overrides (medium-term)

```yaml
brain: rover
site: "@mysites/portfolio" # npm package in instance node_modules
theme: "./theme.css" # local CSS file
```

For custom sites, instances DO need a package.json + node_modules. But only when overriding the bundled default — most instances don't need this.

### Phase 4: In-process webserver cleanup

Remove dead code from standalone-server.ts refactor:

- Delete `standalone-server.ts` (no longer spawned)
- Remove `health-ipc.ts` and heartbeat code (no more IPC)
- Clean up health-route tests that test the old IPC pattern

## Verification

1. `npm install -g @rizom/brain` installs CLI + runtime on any machine with Node
2. `brain init mybrain` creates brain.yaml + .env.example (no package.json)
3. `brain start` boots rover from built-in bundle (needs Bun)
4. `brain list posts --remote rover.rizom.ai` works without Bun
5. `brain init mybrain --deploy` adds deploy files
6. `brain eval` runs model evaluations
