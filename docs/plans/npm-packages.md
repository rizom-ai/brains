# Plan: npm Packages

## Goal

```bash
npm install -g @rizom/brain
brain init mybrain --model rover
cd mybrain
brain start
```

Four commands: install CLI, scaffold instance, enter directory, run brain.

## The runtime flow

### 1. Install CLI

```bash
npm install -g @rizom/brain
```

Installs the `brain` command. Works on Node (no Bun needed for init and remote mode).

### 2. Scaffold instance

```bash
brain init mybrain --model rover
```

Creates a minimal instance:

```
mybrain/
  brain.yaml              # points to @brains/rover
  package.json            # depends on @brains/rover, has "start" script
  .env.example            # secret templates (API keys)
  .gitignore              # excludes .env, node_modules
```

`brain.yaml`:

```yaml
brain: "@brains/rover"
preset: default
```

`package.json`:

```json
{
  "private": true,
  "scripts": {
    "start": "rover"
  },
  "dependencies": {
    "@brains/rover": "^1.0.0"
  }
}
```

The version is pinned (caret range) — not `"latest"`. The CLI resolves the current version at init time.

Deploy scaffolding (deploy.yml, Kamal hooks, CI workflow) is opt-in:

```bash
brain init mybrain --model rover --deploy    # adds deploy files
```

After scaffolding, `brain init` runs `bun install` if Bun is available, or prints instructions.

### 3. Start brain

```bash
brain start
```

The CLI:

1. Reads `brain.yaml` → gets `brain: "@brains/rover"`
2. If `node_modules/` doesn't exist → runs `bun install` (auto-install)
3. Spawns: `bun run start`

The scaffolded `package.json` has `"start": "rover"`. `bun run start` resolves the `rover` binary from `node_modules/.bin/rover`. No `bunx` ambiguity — local resolution only.

The brain model's `package.json` declares `"bin": { "rover": "./dist/entrypoint.js" }`. `bun install` links it to `node_modules/.bin/rover`.

The entrypoint (`@brains/rover/dist/entrypoint.js`):

1. Reads `brain.yaml` from cwd
2. Imports the brain definition from its own package
3. Resolves site overrides (if `site:` is set in brain.yaml)
4. Calls `resolve(definition, env, overrides)` → `AppConfig`
5. Creates `App`, initializes, starts daemons

```typescript
// brain start — simplified
const brainYaml = readBrainYaml(cwd);

if (!existsSync(join(cwd, "node_modules"))) {
  spawnSync("bun", ["install"], { cwd, stdio: "inherit" });
}

spawn("bun", ["run", "start"], { cwd, stdio: "inherit" });
```

### Runner resolution

Three paths, checked in order:

```typescript
function resolveRunner(cwd: string): "monorepo" | "docker" | "npm" {
  // 1. Monorepo: shell/app/src/runner.ts exists
  const monorepoRoot = findMonorepoRoot(cwd);
  if (monorepoRoot && existsSync(join(monorepoRoot, "shell/app/src/runner.ts")))
    return "monorepo";

  // 2. Docker: pre-built entrypoint in dist/
  if (existsSync(join(cwd, "dist/.model-entrypoint.js"))) return "docker";

  // 3. npm: package.json with brain model dependency
  if (existsSync(join(cwd, "package.json"))) return "npm";

  throw new Error("No runner found");
}
```

- **Monorepo**: `bun run shell/app/src/runner.ts` (existing path)
- **Docker**: `bun run dist/.model-entrypoint.js` (existing path)
- **npm**: `bun run start` (uses scaffolded `"start"` script)

## What's in each package

### @rizom/brain (CLI)

```
dist/brain.js            # bundled CLI (single file)
package.json             # bin: { brain: "./dist/brain.js" }
```

No native deps. MCP SDK loaded lazily (only for `--remote`). Works on Node.

### @brains/rover (brain model)

```
dist/
  entrypoint.js          # reads brain.yaml, boots brain
  definition.js          # defineBrain() export (for programmatic use)
migrations/
  entity-service/        # Drizzle SQL files
  conversation-service/
  job-queue/
seed-content/            # default markdown files for first run
public/                  # static assets (favicons)
package.json
```

`package.json`:

```json
{
  "name": "@brains/rover",
  "version": "1.0.0",
  "bin": {
    "rover": "./dist/entrypoint.js"
  },
  "exports": {
    ".": "./dist/definition.js",
    "./entrypoint": "./dist/entrypoint.js"
  },
  "optionalDependencies": {
    "sharp": "^0.34.5",
    "@libsql/client": "^0.14.0",
    "better-sqlite3": "^11.8.1",
    "fastembed": "^1.14.4",
    "lightningcss": "^1.29.2",
    "@tailwindcss/oxide": "^4.x"
  }
}
```

**Bundled** (inlined): all workspace code — shell, plugins, entities, shared utils, default themes/layouts/sites.

**External** (`optionalDependencies`): native platform-specific binaries. Installed by `bun install` in the instance directory.

**Note:** `fastembed` and `onnxruntime-node` move to the [AI runtime sidecar](./embedding-service.md) when available. Until then, they're `optionalDependencies` on the brain model. The sidecar makes the package lighter and removes the heaviest native deps.

## Site overrides

The bundled brain model includes a default site. Users override in brain.yaml:

```yaml
brain: "@brains/rover"
site: "@mysites/portfolio" # npm package — install in instance package.json
```

The entrypoint resolves site at boot:

```typescript
// In @brains/rover entrypoint
const overrides = parseInstanceOverrides(readFileSync("brain.yaml", "utf-8"));

let site = definition.site; // bundled default
if (overrides.site) {
  site = (await import(overrides.site)).default; // dynamic import from node_modules
}

const config = resolve(definition, env, { ...overrides, site });
```

For a custom site, the user adds it to their instance `package.json`:

```json
{
  "dependencies": {
    "@brains/rover": "^1.0.0",
    "@mysites/portfolio": "^1.0.0"
  }
}
```

**Theme-only override** (no separate site package):

```yaml
brain: "@brains/rover"
theme: "./theme.css" # local CSS file, loaded at build time
```

The site builder loads `theme.css` from cwd if it exists, merging with the bundled theme's CSS variables.

## Build

### CLI build

```bash
bun build packages/brain-cli/src/index.ts --outdir dist --target node
```

Single file, no externals needed (MCP SDK bundled but lazy-imported).

### Brain model build

Extend existing `build-model.ts`:

```bash
bun shell/app/scripts/build-model.ts rover --output npm
```

1. Generate `entrypoint.js` (reads brain.yaml, imports definition, boots)
2. Generate `definition.js` (exports `defineBrain()` result)
3. Bundle both with `bun build` — workspace code inlined, native deps externalized
4. Copy migrations, seed-content, public to output directory
5. Generate `package.json` with correct metadata + `optionalDependencies`

Same bundler config as Docker build. Different output structure.

## Available brain models

`brain init --model <name>` needs to know which models exist.

Phase 1: hardcoded list in the CLI (`rover`, `ranger`, `relay`). Simple, covers our models.

Phase 2: query npm registry — `npm search @brains/ --json` returns published brain model packages. Any package matching `@brains/*` with the right exports shape is a brain model.

## Steps

### Phase 1: CLI npm publish (short-term)

1. Replace `Bun.spawn` with `child_process.spawn` (Node compat for init/remote)
2. Build script for CLI bundle (`bun build --target node`)
3. Publish-ready package.json (name: `@rizom/brain`, bin, files)
4. Update `brain init` to scaffold `package.json` with start script
5. Make deploy scaffolding opt-in (`--deploy` flag)
6. Publish `@rizom/brain` to npm
7. Test: `npm install -g @rizom/brain && brain init test && brain --help`

### Phase 2: Brain model packages (short-term)

1. Add npm output mode to `build-model.ts` (entrypoint.js + definition.js)
2. Generate package.json with bin, exports, optionalDependencies
3. Copy sidecar files (migrations, seed-content, public)
4. Update `brain start` — auto-install + `bun run start` path when no monorepo/Docker runner found
5. Publish `@brains/rover` to npm
6. Test: `brain init mybrain && cd mybrain && brain start`

### Phase 2b: In-process webserver

The webserver currently spawns `standalone-server.ts` as a child process via `Bun.spawn`. In the npm bundle, all code is in a single file — the standalone server doesn't exist as a separate file, so the spawn fails.

Fix: run the static file server (Hono) in-process instead of spawning a child process. The code is already in the bundle — it just needs to be imported and started directly rather than spawned as a separate file.

This also simplifies the architecture: no child process management, no IPC heartbeat, no stdout parsing for readiness. The Hono server starts in the same process as everything else.

1. Refactor ServerManager to start Hono server in-process
2. Remove child process spawn, IPC heartbeat, stdout readiness detection
3. Keep the same Hono routes (static files, clean URLs, cache headers)
4. Test: `brain start` serves static site from npm package

### Phase 3: Runtime site overrides (medium-term)

1. Add `site` field to instance overrides schema
2. Dynamic import of site package in entrypoint
3. Theme-only CSS override (load from cwd)
4. `brain init --site` flag
5. Test: custom site package overrides bundled default

## Verification

1. `npm install -g @rizom/brain` works on Node
2. `brain init mybrain` creates brain.yaml + package.json (no deploy files)
3. `brain init mybrain --deploy` creates brain.yaml + package.json + deploy files
4. `brain start` auto-installs deps and boots via `bun run start`
5. `brain list posts` works headless
6. `brain --remote rover.rizom.ai` works without Bun
7. Custom `site:` in brain.yaml overrides bundled site
8. `theme.css` in cwd overrides bundled theme colors
