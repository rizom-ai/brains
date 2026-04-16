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
├── README.md          # minimum/optional env vars + reset instructions
├── .gitignore         # */brain-data/, */.env*, */cache/, */dist/, */data/
├── core/brain.yaml
├── default/brain.yaml
└── full/brain.yaml
```

Each `brain.yaml` specifies only `brain: rover`, `preset: <name>`, and a test-scoped `plugins.directory-sync.seedContentPath: ../../eval-content` override. `domain` is omitted (not needed for local iteration). Secrets come from the developer's shell env — no per-app `.env` files to maintain.

Per-preset `brain-data/` directories are gitignored. On first run, `directory-sync` seeds each preset from the shared `brains/rover/eval-content/`, using the existing `seedContentPath` mechanism rather than a custom `prestart` copy step. This keeps the test apps config-only while still giving them richer sample content than `seed-content/` (real anchor-profile, deck, image, link, agent entities + sample essay).

The common minimum local env for boot is `AI_API_KEY` + `GIT_SYNC_TOKEN`. Use a real `AI_API_KEY` if AI-backed flows should succeed; placeholder values may still let the app boot, but background AI jobs will fail. `MCP_AUTH_TOKEN` is optional for local HTTP auth, but without it the MCP HTTP daemon will not start. `DISCORD_BOT_TOKEN` is optional because the Discord interface is skipped when unset, and service-specific tokens (LinkedIn, Buttondown, Unsplash, Cloudflare) are only needed when exercising those integrations.

Separate data dirs per preset because presets register different entity types. A single shared DB would leave narrower presets with entities they don't know about after a run of the wider preset.

**Resetting a preset**: `rm -rf brains/rover/test-apps/<preset>/brain-data` — next `start:*` re-seeds. Documented in the README. No reset npm scripts.

**Port conflicts**: not addressed — devs run one preset at a time. All three use the default brain port; concurrent runs would collide with a loud failure. Per-preset port config can be added later if that use case materializes.

## What changes

### New

- `brains/rover/test-apps/.gitignore` — ignore `*/brain-data/`, `*/.env*`, `*/cache/`, `*/dist/`, `*/data/`
- `brains/rover/test-apps/README.md` — common minimum env, optional integration env vars, reset instructions
- `brains/rover/test-apps/core/brain.yaml`
- `brains/rover/test-apps/default/brain.yaml`
- `brains/rover/test-apps/full/brain.yaml`

### Modified

- `brains/rover/package.json` — add three start scripts that run the in-repo `@rizom/brain` package via Bun workspace filtering, preserving the test-app cwd through `INIT_CWD`:

  ```json
  "scripts": {
    "start:core":    "cd test-apps/core && INIT_CWD=$PWD bun run --filter @rizom/brain dev:start",
    "start:default": "cd test-apps/default && INIT_CWD=$PWD bun run --filter @rizom/brain dev:start",
    "start:full":    "cd test-apps/full && INIT_CWD=$PWD bun run --filter @rizom/brain dev:start"
  }
  ```

  This avoids cross-package relative paths and avoids relying on `bunx` resolution. It intentionally uses the in-repo `@rizom/brain` package as the monorepo dev entrypoint.

- `packages/brain-cli/package.json` — add a small workspace-internal dev script used by the filtered invocation:

  ```json
  "scripts": {
    "dev:start": "bun dist/brain.js start"
  }
  ```

- `brains/rover/package.json` → `files` array — **do not** include `test-apps` (kept out of publish by default)

### Not changing

- `brains/rover/src/` — no code changes
- `brains/rover/brain.eval.yaml` + `test-cases/` + `eval-content/` — existing eval infrastructure stays as is

## Verification

1. `bun start:core` in `brains/rover/` boots successfully with the core preset using only the minimum local env; `site-builder` is not active, while the core `webserver` interface remains active. With a real `AI_API_KEY`, background AI flows also succeed.
2. `bun start:default` boots successfully with the default preset and starts the website surface (`site-builder` + `webserver`).
3. `bun start:full` boots successfully with the full preset; missing optional integration secrets only skip the corresponding integrations rather than blocking local startup.
4. First boot of each preset creates and seeds its own `brains/rover/test-apps/<preset>/brain-data/` from `brains/rover/eval-content/`.
5. Running one preset then another preserves each preset's own `brain-data/` — no cross-contamination.
6. `@rizom/brain` publish output does not include `test-apps/` (inspect `npm pack --dry-run`).
7. `bun start:core` resolves through the in-repo `@rizom/brain` workspace package rather than a relative path or implicit global CLI.

## Non-goals

- Testing the published `@rizom/brain` install path — that's `standalone-apps.md`.
- Testing `brain init --model rover` scaffold output — separate concern.
- Replacing `apps/*` — these are different use cases.
- Automated test runs — these are dev iteration targets, not CI tests.
