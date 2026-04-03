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
    └── Model (rover — v0.1.0 ships rover only)
```

**v0.1.0 ships rover only.** Ranger and relay are not bundled — they'll be added in a future release once they have more eval coverage.

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

```
mybrain/
  brain.yaml        # model + config
  .env              # secrets
  .gitignore
  brain-data/       # entities as markdown (managed by directory-sync)
  data/             # SQLite databases (auto-created)
  package.json      # optional — only when version is pinned or external plugins added
```

By default, no `package.json`. Uses the globally installed `@rizom/brain`. For production or reproducibility, `brain pin` creates a `package.json` that locks to a specific version.

**Implementation details:**

- `brain pin` auto-installs after creating package.json
- `brain start` checks for `./node_modules/@rizom/brain` — if found, re-execs with the local binary instead of continuing with the global one

## What's done

### CLI ✅

- `brain init <dir>` — scaffolds brain.yaml, .env.example, .gitignore
- `brain init --deploy` — adds deploy.yml, Kamal hooks, CI workflow
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
- optionalDependencies for native platform binaries (sharp, libsql, fastembed, etc.)

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

### Phase 1: Publish v0.1.0

#### Release blockers

1. ~~**README.md** for npm registry page~~ ✅
2. ~~**package.json metadata** — homepage, bugs, author, engines~~ ✅
3. ~~**Bun version check** — validate `Bun.version >= 1.3.3` before any command~~ ✅
4. ~~**AI model + key simplification**~~ ✅ — full scope:
   - `model: gpt-4o-mini` in brain.yaml, auto-detects provider from model name
   - `AI_API_KEY` single env var, no fallbacks (new product, no backward compat)
   - One key flows through entire chain — same key for text + images
   - **Cut list** (remove these fields entirely):
     - `AppConfig.openaiApiKey` + `AppConfig.googleApiKey` → gone
     - `ShellConfig.ai.openaiApiKey` + `ShellConfig.ai.googleApiKey` → gone
     - `AIModelConfig.openaiApiKey` + `AIModelConfig.googleApiKey` → gone
     - `OPENAI_API_KEY` + `ANTHROPIC_API_KEY` + `GOOGLE_GENERATIVE_AI_API_KEY` → `AI_API_KEY` + `AI_IMAGE_KEY`
   - **Add list**:
     - `AIModelConfig.provider` — already done
     - `InstanceOverrides.model` — already done
     - `resolveAIConfig()` in resolver — resolves model → provider + passes key
     - `AIService.getModel()` uses provider to select SDK — already done
   - **Update list**:
     - `brain init` scaffolds `AI_API_KEY=` — already done
     - .env.schema files, docs, deploy configs
5. ~~**API key pre-check** — validate `AI_API_KEY` before boot, clear error~~ ✅
6. ~~**Multi-model evals**~~ ✅ — `models:` array in brain.eval.yaml, per-model eval loop, markdown + JSON comparison report
7. **Create `@rizom` npm org** — manual step
8. **`npm publish`** — ship it

#### Polish before release

9. ~~**`brain pin`**~~ ✅ — creates package.json, auto-installs, pins version
10. ~~**Local-over-global re-exec**~~ ✅ — `./node_modules/@rizom/brain` takes precedence
11. ~~**Full brain.yaml validation**~~ ✅ — proper YAML + Zod schema, replaces regex
12. ~~**Better boot error messages**~~ ✅ — classifies DB, plugin, port, permission, git errors
13. ~~**LICENSE file**~~ ✅ — AGPL-3.0-only. Protects hosted offering while keeping code open for self-hosters and plugin developers.
14. ~~**Fix docs wording**~~ ✅ — getting-started.md updated to list all supported providers.
15. **Directory creation error handling** — `getStandardConfigWithDirectories()` calls `mkdir()` with no error handling. If user can't write to `./data/`, it crashes before `formatBootError` kicks in. Wrap in try/catch with a clear "Cannot create data directory" message.
16. **Port conflict handling** — `Bun.serve()` in the webserver has no EADDRINUSE handling. Second `brain start` crashes. Catch the error and suggest stopping the other instance or configuring a different port.
17. **Malformed brain.yaml feedback** — invalid YAML silently returns `{}`, user won't know their config is broken. Add a warning when YAML parse produces an empty object from a non-empty file.
18. **Embedding model download progress** — first `brain start` downloads a ~30MB embedding model with no indication. Add a log message before the download: "Downloading embedding model (first run only)..."
19. **SQLite busy handling** — two instances on the same directory hit SQLITE_BUSY after 5s. Detect the lock on startup and exit with "Another brain is running in this directory" rather than a cryptic SQLite error.
20. **Eval env var naming** — `brain.eval.yaml` uses `${OPENAI_API_KEY}` and `${ANTHROPIC_API_KEY}` for per-provider keys. These are intentional for multi-model evals but inconsistent with the unified `AI_API_KEY` naming. Document the convention or update the eval runner to accept both.

### Phase 2: Deploy scaffolding ✅

```bash
brain init mybrain --model rover --deploy
```

Already implemented via `--deploy` flag.

### Phase 3: External Plugin API

Separate plan: [external-plugin-api.md](./external-plugin-api.md)

### Phase 4: Runtime site/theme overrides

```yaml
brain: rover
site: "@rizom/site-portfolio"
theme: "./theme.css"
```

Custom sites need `package.json` + `node_modules`. Theme-only overrides work with just a local CSS file.

## Verification

1. `bun add -g @rizom/brain` installs on any machine with Bun >= 1.3.3
2. `brain init mybrain` creates brain.yaml + .env.example (no package.json)
3. `brain start` boots rover in-process from built-in bundle
4. `brain list posts` runs headless in-process without starting daemons
5. `brain list posts --remote rover.rizom.ai` queries deployed brain
6. `brain init mybrain --deploy` adds deploy files
7. `brain eval` runs model evaluations
8. `brain pin` creates package.json with pinned version
9. `brain start` (with package.json) uses local pinned version over global
