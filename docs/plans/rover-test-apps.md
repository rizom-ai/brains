# Plan: per-preset rover test apps

## Status

Proposed.

## Context

Rover has three presets (`core`, `default`, `full`) but no locally bootable instance for any of them. Developers iterating on rover code currently rely on `apps/*` wrappers, which carry deploy config and instance-specific concerns orthogonal to the model.

The goal is fast local iteration against each rover preset, not release testing. Release testing lives in `standalone-apps.md` (clean-machine install path, `brain init` scaffold correctness).

## Design

Three config-only test apps under `brains/rover/test-apps/`, one per preset. No `package.json`, no `.env.schema`, no deploy scaffold — just a `brain.yaml` that the brain CLI can boot.

```
brains/rover/test-apps/
├── README.md          # env vars each preset needs + reset instructions
├── .gitignore         # */brain-data/, */.env*, */cache/, */dist/, */data/
├── core/brain.yaml
├── default/brain.yaml
└── full/brain.yaml
```

Each `brain.yaml` specifies only `brain: rover` and `preset: <name>` plus any test-scoped plugin config. `domain` is omitted (not needed for local iteration). Secrets come from the developer's shell env — no per-app `.env` files to maintain.

Per-preset `brain-data/` directories are gitignored. On first run each is populated from the shared `brains/rover/eval-content/` — richer sample content than `seed-content/` (real anchor-profile, deck, image, link, agent entities + sample essay). Exact population mechanism (directory-sync seed-path override vs a `prestart` copy step) is resolved at implementation time.

Separate data dirs per preset because presets register different entity types. A single shared DB would leave narrower presets with entities they don't know about after a run of the wider preset.

**Resetting a preset**: `rm -rf brains/rover/test-apps/<preset>/brain-data` — next `start:*` re-seeds. Documented in the README. No reset npm scripts.

**Port conflicts**: not addressed — devs run one preset at a time. All three use the default brain port; concurrent runs would collide with a loud failure. Per-preset port config can be added later if that use case materializes.

## What changes

### New

- `brains/rover/test-apps/.gitignore` — ignore `*/brain-data/`, `*/.env*`, `*/cache/`, `*/dist/`, `*/data/`
- `brains/rover/test-apps/README.md` — env vars each preset needs, reset instructions
- `brains/rover/test-apps/core/brain.yaml`
- `brains/rover/test-apps/default/brain.yaml`
- `brains/rover/test-apps/full/brain.yaml`

### Modified

- `brains/rover/package.json` — add `@rizom/brain` as a workspace devDependency and three start scripts, each with a `pre` hook that builds the CLI through turbo (cache-hit fast when nothing changed):

  ```json
  "devDependencies": {
    "@rizom/brain": "workspace:*"
  },
  "scripts": {
    "build:cli":        "turbo run build --filter=@rizom/brain",
    "prestart:core":    "bun run build:cli",
    "start:core":       "cd test-apps/core && bunx brain start",
    "prestart:default": "bun run build:cli",
    "start:default":    "cd test-apps/default && bunx brain start",
    "prestart:full":    "bun run build:cli",
    "start:full":       "cd test-apps/full && bunx brain start"
  }
  ```

  No relative paths (`@rizom/brain` resolves via workspace), no hand-managed build order (`prestart:*` + turbo handle it).

- `brains/rover/package.json` → `files` array — **do not** include `test-apps` (kept out of publish by default)

### Not changing

- `brains/rover/src/` — no code changes
- `brains/rover/brain.eval.yaml` + `test-cases/` + `eval-content/` — existing eval infrastructure stays as is

## Verification

1. `bun start:core` in `brains/rover/` boots a brain with preset core — MCP available, no site-builder, no webserver.
2. `bun start:default` boots with the default preset — site-builder + webserver registered.
3. `bun start:full` boots with all plugins registered.
4. Running one preset then another preserves each preset's own `brain-data/` — no cross-contamination.
5. `@rizom/brain` publish output does not include `test-apps/` (inspect `npm pack --dry-run`).

## Non-goals

- Testing the published `@rizom/brain` install path — that's `standalone-apps.md`.
- Testing `brain init --model rover` scaffold output — separate concern.
- Replacing `apps/*` — these are different use cases.
- Automated test runs — these are dev iteration targets, not CI tests.
