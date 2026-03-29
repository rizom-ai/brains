# Plan: Brain Model npm Packages

## Context

Brain models are distributed as Docker images for production deploys. But the desktop app (Electrobun) and hosted rovers (K8s) need them as npm packages — `bun install @brains/rover && bun run start`.

This is independent of the Docker path. Both are distribution channels for the same brain model code. They can progress in parallel.

## The problem

Brain models import from ~30 workspace packages (`@brains/blog`, `@brains/plugins`, `@brains/entity-service`, etc.). Publishing to npm means either:

1. **Publish every workspace package** — 70+ packages, version coordination nightmare
2. **Bundle into a single package** — one artifact with all dependencies inlined

Option 2 is the answer. The monorepo already bundles for Docker via `shell/app/scripts/build-model.ts`. The npm path needs a similar bundle that produces an installable package instead of a Docker layer.

## Native dependencies

These can't be bundled — they contain platform-specific binaries:

| Package          | What                | Strategy                                                      |
| ---------------- | ------------------- | ------------------------------------------------------------- |
| `sharp`          | Image optimization  | `optionalDependencies` — ships prebuilt binaries per platform |
| `better-sqlite3` | SQLite driver       | `optionalDependencies` — prebuilt binaries                    |
| `@libsql/client` | Turso/libSQL client | Pure JS core, optional native binding                         |
| `fastembed`      | ONNX embeddings     | Downloads models at runtime, pure JS                          |

These become `optionalDependencies` in the published package.json — npm/bun installs the right binary for the user's platform automatically.

## What the bundle looks like

```
@brains/rover (npm package)
  dist/
    index.js          # bundled brain model (all workspace deps inlined)
    brain-entrypoint.js  # CLI entry point
  seed-content/       # default content
  public/             # static assets
  package.json        # name, version, bin, optionalDependencies
```

```json
{
  "name": "@brains/rover",
  "version": "1.0.0",
  "bin": {
    "rover": "./dist/brain-entrypoint.js"
  },
  "optionalDependencies": {
    "sharp": "^0.33.5",
    "better-sqlite3": "^11.8.1",
    "@libsql/client": "^0.14.0"
  }
}
```

Usage:

```bash
bun install @brains/rover
bunx rover          # starts the brain, reads brain.yaml from cwd
```

## Relationship to Docker

Once npm packages work, Docker images can build FROM them:

```dockerfile
FROM oven/bun:slim
RUN bun install @brains/rover
CMD ["bunx", "rover"]
```

Single source of truth — npm package is the artifact, Docker wraps it. But this is optional. Docker can keep using the current monorepo build if simpler.

## Steps

### Phase 1: Bundle script

1. Extend `shell/app/scripts/build-model.ts` to produce an npm-publishable package
2. Output: `dist/` with bundled JS + `package.json` with correct metadata + `seed-content/` + `public/`
3. Native deps listed as `optionalDependencies` (not bundled)
4. Test: `cd output && bun install && bun run start` works with a brain.yaml

### Phase 2: Publish pipeline

1. CI pipeline: build + publish to npm registry on release
2. Scoped packages: `@brains/rover`, `@brains/ranger`, `@brains/relay`
3. Version from brain model's package.json (or git tag)
4. Test: `bun install @brains/rover@latest` from a clean directory works

### Phase 3: CLI entry point

1. `bunx rover` reads `brain.yaml` from cwd, starts the brain
2. `bunx rover --init` creates a starter `brain.yaml`
3. Same entry point used by Docker and Electrobun

## Verification

1. `bun install @brains/rover` installs successfully on macOS + Linux
2. `bunx rover` starts a brain with a local brain.yaml
3. Native deps (Sharp, SQLite) work without manual setup
4. Package size is reasonable (< 50MB excluding node_modules)
5. Docker image can be built FROM the npm package
