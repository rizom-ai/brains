# Plan: npm Packages

## Context

Two things need to be published to npm:

1. **`@rizom/brain`** — the CLI tool + future runtime. Init instances, run operations, query remote brains.
2. **`@brains/{model}`** — bundled brain models (`@brains/rover`, etc.) for desktop app and hosted rovers.

`@rizom/brain` is the user-facing tool. Brain models are the engine underneath.

```bash
# Install the CLI
npm install -g @rizom/brain

# Scaffold + deploy
brain init mybrain --model rover
cd mybrain
brain start                                    # local (needs bun + brain model)
brain status --remote mybrain.rizom.ai         # remote (works on any Node machine)

# Future: run brain model directly
bun install @brains/rover
bunx rover                                     # reads brain.yaml, starts brain
```

## @rizom/brain (CLI)

Single package, two capabilities that grow over time:

| Capability | When  | What                                                  |
| ---------- | ----- | ----------------------------------------------------- |
| CLI        | Now   | `brain init`, `brain start`, `brain list`, `--remote` |
| Runtime    | Later | `import { createBrain } from "@rizom/brain"`          |

### Done

`packages/brain-cli/` in the monorepo. All commands work from source via `bun run brain`: init, start, chat, list/get/search/sync/build/status (schema-driven mapping), remote mode (MCP HTTP client), eval.

### Next: npm publish

Publish `@rizom/brain` to npm. Node-compatible for init and remote mode. Local operations still spawn Bun (brain runtime requires it).

#### Node compatibility

Replace `Bun.spawn` with `child_process.spawn` in 3 files. The CLI binary runs on Node — init and remote mode work without Bun. Local commands (`brain start`, `brain list`) spawn `bun run <runner>`, so Bun is only needed when running a brain locally.

| Command                 | Needs Bun? | Why                                                       |
| ----------------------- | ---------- | --------------------------------------------------------- |
| `brain init`            | No         | Pure file scaffolding                                     |
| `brain --help`          | No         | Static output (or registerOnly boot for dynamic commands) |
| `brain status --remote` | No         | MCP HTTP client only                                      |
| `brain list posts`      | Yes        | Spawns `bun run runner.ts`                                |
| `brain start`           | Yes        | Spawns `bun run runner.ts`                                |

#### Build

Bundle with `bun build` into a single `dist/brain.js`. External: `@modelcontextprotocol/sdk` (runtime dependency).

```json
{
  "name": "@rizom/brain",
  "version": "0.1.0",
  "bin": {
    "brain": "./dist/brain.js"
  },
  "exports": {
    "./cli": "./dist/brain.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.x"
  }
}
```

#### Steps

1. Replace `Bun.spawn` with `child_process.spawn` in operate.ts, start.ts, run-command.ts
2. Add build script (`scripts/build.ts`) using `Bun.build`
3. Create publish-ready `package.json` (name, bin, files, exports)
4. Add `prepublishOnly` script that runs build
5. Test: `npm pack` → install globally → `brain init test && brain --help`
6. Publish to npm

### Phase 6: Runtime exports (future)

Add runtime API alongside the CLI. Brain models import from `@rizom/brain`:

```typescript
import { createBrain } from "@rizom/brain";
```

This is the shared foundation — CLI and runtime in one package. Not needed until desktop app or hosted rovers.

---

## @brains/{model} (Brain Models)

Bundle brain models as npm packages. Independent of Docker path — both are distribution channels for the same code.

Depends on: `@rizom/brain` Phase 6 (runtime exports).

### The problem

Brain models import from ~30 workspace packages. Publishing to npm means bundling everything into a single artifact. The monorepo already bundles for Docker via `build-model.ts`. npm needs a similar bundle that produces an installable package.

### Native dependencies

Can't be bundled — contain platform-specific binaries:

| Package          | Strategy                                       |
| ---------------- | ---------------------------------------------- |
| `sharp`          | `optionalDependencies` — prebuilt per platform |
| `better-sqlite3` | `optionalDependencies` — prebuilt binaries     |
| `@libsql/client` | Pure JS core, optional native binding          |
| `fastembed`      | Downloads models at runtime, pure JS           |

### What the bundle looks like

```
@brains/rover (npm package)
  dist/
    index.js              # bundled brain model (all workspace deps inlined)
    brain-entrypoint.js   # CLI entry point
  seed-content/           # default content
  public/                 # static assets
  package.json
```

```json
{
  "name": "@brains/rover",
  "version": "1.0.0",
  "bin": {
    "rover": "./dist/brain-entrypoint.js"
  },
  "optionalDependencies": {
    "sharp": "^0.34.5",
    "better-sqlite3": "^11.8.1",
    "@libsql/client": "^0.14.0"
  }
}
```

Usage:

```bash
bun install @brains/rover
bunx rover          # reads brain.yaml from cwd, starts brain
```

### Relationship to Docker

Once npm packages work, Docker images can build FROM them:

```dockerfile
FROM oven/bun:slim
RUN bun install @brains/rover
CMD ["bunx", "rover"]
```

Single source of truth — npm is the artifact, Docker wraps it. But optional — Docker can keep using the current monorepo build.

### Steps

#### Phase A: Bundle script

1. Extend `build-model.ts` to produce an npm-publishable package
2. Output: `dist/` + `package.json` + `seed-content/` + `public/`
3. Native deps as `optionalDependencies`
4. Test: `cd output && bun install && bun run start` works

#### Phase B: Publish pipeline

1. CI: build + publish on release
2. Scoped: `@brains/rover`, `@brains/ranger`, `@brains/relay`
3. Version from git tag or brain model package.json

#### Phase C: Docker from npm

1. Dockerfile uses `bun install @brains/rover` instead of monorepo build
2. Single artifact path: source → npm → Docker

---

## How they work together

```
User installs:     npm install -g @rizom/brain
User scaffolds:    brain init mybrain --model rover
User deploys:      git push (CI runs kamal deploy)
User queries:      brain status --remote mybrain.rizom.ai

Under the hood:
  brain init         → scaffolds brain.yaml pointing to @brains/rover
  kamal deploy       → pulls ghcr.io/rizom-ai/rover Docker image
  brain start        → spawns bun with @brains/rover (local dev)
  brain --remote     → MCP HTTP client, no local brain needed
```

## Verification

1. `npm install -g @rizom/brain` installs on any Node machine
2. `brain init mybrain` works without Bun
3. `brain status --remote rover.rizom.ai` works without Bun
4. `brain list posts` works with Bun installed
5. `bun install @brains/rover && bunx rover` starts a brain (Phase A)
6. Docker images build FROM npm packages (Phase C)
