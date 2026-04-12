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
- `brain init <dir> --deploy` — adds config/deploy.yml, Kamal hooks, CI workflow
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
13. ~~**LICENSE file**~~ ✅ — Apache-2.0. Maximum adoption for v0.1, can tighten later if needed.
14. ~~**Fix docs wording**~~ ✅ — getting-started.md updated for OpenAI as default provider.
15. ~~**Directory creation error handling**~~ ✅ — `getStandardConfigWithDirectories()` wraps mkdir in try/catch with clear EACCES message.
16. ~~**Port conflict handling**~~ ✅ — webserver catches EADDRINUSE from Bun.serve() with "port already in use" message.
17. ~~**Malformed brain.yaml feedback**~~ ✅ — shared `parseYamlDocument` in @brains/utils handles empty files, bare strings, arrays. Both brain-cli and shell/app use it.
18. ~~**Embedding model download progress**~~ ✅ — logs "Downloading embedding model (first run only, ~30MB)..." when model cache doesn't exist.
19. ~~**SQLite busy handling**~~ ✅ — `formatBootError` catches SQLITE_BUSY with "Another brain is running in this directory" message.
20. ~~**Eval env var naming**~~ ✅ — per-provider keys (OPENAI_API_KEY, ANTHROPIC_API_KEY) are intentional for multi-model evals. resolveProviderKey handles the lookup correctly.

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
2. `brain init mybrain` creates `brain.yaml`, `.env.example`, and the local support files for a lightweight instance package (including `package.json`)
3. `brain start` boots rover in-process from built-in bundle
4. `brain list posts` runs headless in-process without starting daemons
5. `brain list posts --remote rover.rizom.ai` queries deployed brain
6. `brain init mybrain --deploy` adds deploy files
7. `brain eval` runs model evaluations
8. `brain pin` creates package.json with pinned version
9. `brain start` (with package.json) uses local pinned version over global
