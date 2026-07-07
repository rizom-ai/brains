# Plan: env handling — declarations and read sites

## Status

Proposed. Consolidates two earlier plans (`core-env-config.md` and `env-schema-canonical.md`) covering complementary halves of the same shell/core ↔ app/deploy boundary. Concrete claims still hold:

- `shell/core/src/config/standardConfig.ts` still reads `XDG_DATA_HOME` / `XDG_CACHE_HOME` directly.
- App migration scripts still import `getStandardConfigWithDirectories()` from core.
- `packages/brain-cli/src/lib/env-schema.ts` still composes `.env.schema` from inlined fragments plus the generated `packages/brain-cli/src/lib/generated/bundled-model-env-schemas.ts`.
- A CLI-side test (`packages/brain-cli/test/env-schema.test.ts`) keeps the CLI internally honest but does not assert against actual shell expectations.

## Problem

Env handling is split across three places with silent drift:

1. **Declarations are duplicated.** `brain-cli` composes `.env.schema` from inlined string fragments and `bundled-model-env-schemas.ts`. The shell reads the same vars at runtime through `shell/core/src/config/` and individual services. Adding a new env var requires editing both halves: forget the CLI side and the operator gets a useless `.env.schema`; forget the shell side and the var is never read.
2. **`shell/core` depends on ambient process state.** Core standard config reads `XDG_DATA_HOME` / `XDG_CACHE_HOME` directly to compute default DB and cache paths. Core tests have to mock env, and runtime environment policy ends up baked into core defaults rather than the deploy layer that actually owns it.

## Goal

- Each shell-side service declares its env vars next to where they're read; `shell/core` aggregates them; `brain-cli` consumes the same aggregation for `.env.schema`. One edit per new var.
- `shell/core` is deterministic and config-driven. Env reading happens in the app/deploy layer, which translates env into explicit config before construction.

## Part A — Co-located declarations

### Co-located per service

```ts
// shell/ai-service/src/env-schema.ts
export const aiServiceEnvSchema = [
  { name: "AI_API_KEY", required: true, sensitive: true, description: "..." },
  {
    name: "AI_IMAGE_KEY",
    required: false,
    sensitive: true,
    description: "...",
  },
];
```

### Aggregated at `shell/core`

```ts
// shell/core/src/env-schema.ts
import { aiServiceEnvSchema } from "@brains/ai-service/env-schema";
import { directorySyncEnvSchema } from "@brains/directory-sync/env-schema";
// ...

export function shellEnvVars(model: string): EnvVarDecl[] { ... }
```

The function takes `model` because preset composition determines which services are wired in for a given brain.

### CLI consumes the canonical function

`brain-cli/src/lib/env-schema.ts` imports `shellEnvVars()` and renders it to varlock-flavored `.env.schema` format. Deploy/TLS/backend-bootstrap fragments stay where they are — those are CLI-owned scaffolding vars the shell never reads.

### Boundary

- **Shell-owned**: app env vars consumed by shell services (AI keys, sync settings, DB paths, secrets that flow into runtime config).
- **CLI-owned**: scaffolding env vars never read by the shell (`HCLOUD_TOKEN`, TLS cert vars, varlock backend-bootstrap).

The CLI assembles both halves; the shell only needs its half.

## Part B — Env reads in the app/deploy layer

### Move env reading out of `shell/core`

1. Add an app/deploy-level helper that reads `XDG_DATA_HOME` and `XDG_CACHE_HOME`.
2. Build explicit core config values from that helper:
   - `database.url`
   - `jobQueueDatabase.url`
   - `conversationDatabase.url`
   - `embeddingDatabase.url`
   - `embedding.cacheDir`
3. Pass those explicit values into `createShellConfig()` / `Shell.createFresh()` from app startup.
4. Move migration-script usage of `getStandardConfigWithDirectories()` out of core and into app/deploy utilities.
5. Change `shell/core` standard defaults to fixed paths only:
   - `./data`
   - `./cache`
   - `./dist`
6. Remove `process.env` reads from `shell/core` config.

### Current behavior to preserve

- Docker deploy templates set `XDG_DATA_HOME=/data`.
- Kamal maps persistent state to `/data`.
- Standard DB paths currently resolve to `/data/*.db` in those deployments.

These continue to work because the app/deploy layer reads the same env vars and produces the same explicit paths; only the read site moves.

## How A and B interact

Part A defines **what env vars exist** (metadata co-located with each service). Part B defines **who reads them at startup** (app/deploy layer, not `shell/core`).

The two are independently shippable, but they converge: once both are done, adding a new shell-side env var means a single edit to the relevant service's declarations file. The aggregator picks it up for both `brain init` scaffolding (Part A) and the app/deploy env reader (Part B). The runtime never reads env in `shell/core`.

## Phased steps

Pilot one service end-to-end before fanning out. `ai-service` is a good first candidate — small surface, broadly used.

### Pilot

1. ~~Move `ai-service` env declarations into a co-located schema file (A).~~ DONE 2026-07-07: `shell/ai-service/src/env-schema.ts` with `EnvVarDecl`/renderer in `@brains/utils/env-schema`.
2. ~~Add `shell/core/src/env-schema.ts` with just `ai-service` (A).~~ DONE 2026-07-07: `shellEnvVars(model)` aggregator.
3. ~~Update `brain-cli` composition (A).~~ DONE 2026-07-07, with a mechanism change: instead of the CLI splicing rendered sections at runtime (which would break composition for custom models and change published-CLI behavior), `scripts/sync-env-templates.ts` **generates the shell-owned section into each `brains/*/env.schema.template`** between explicit markers — the same sync-plus-check pattern as the roadmap visual. `env-schema:check` runs in pre-commit whenever an env-schema or template changes; the existing bundle generator then picks the synced templates up unchanged. One edit per var still holds: edit the service's `env-schema.ts`, run `bun run env-schema:sync`.
4. Add the app/deploy XDG helper and wire `ai-service`-relevant paths through it (B).
5. Confirm Docker/Kamal still produce `/data/*.db` for `ai-service` resources.

### Fan out

6. Migrate remaining services to co-located declarations (A).
7. Migrate remaining `shell/core` defaults (`database.url`, `jobQueueDatabase.url`, `conversationDatabase.url`, `embeddingDatabase.url`, `embedding.cacheDir`) into explicit values built at the app/deploy layer (B).
8. Move migration-script `getStandardConfigWithDirectories()` usage out of core (B).
9. Remove `process.env` reads from `shell/core` (B).
10. Remove `bundled-model-env-schemas.ts` (A).
11. Tighten `env-schema.test.ts` to assert generated `.env.schema` matches `shellEnvVars()` output (A).

## Compatibility note

Part B should land as a separate PR from internal core cleanup. It crosses package boundaries and may affect direct `@brains/core` users who rely on XDG env vars implicitly. Those users should pass explicit config or use an app-level helper.

## Non-goals

- Changing the `.env.schema` file format or varlock annotations.
- Changing how operators set env in production (CI secrets, secret backends).
- Validating env at runtime beyond what services already do.

## Verification

Declarations (A):

1. Adding a new env var to a service requires only one edit (in the service's schema file).
2. `brain init` scaffolds that var without touching `brain-cli/src/lib/env-schema.ts`.
3. `bundled-model-env-schemas.ts` no longer exists.
4. `env-schema.test.ts` fails when shell schema and CLI output drift.

Read sites (B):

5. Core: standard config ignores XDG and auth-token env vars; tests pass with no env mocking.
6. App/deploy: XDG maps DBs/cache to `/data` and `/cache` or deployed equivalents.
7. Ops: Docker/Kamal template assertions still pass.

## Related

- `packages/brain-cli/src/lib/env-schema.ts`
- `packages/brain-cli/src/lib/generated/bundled-model-env-schemas.ts`
- `shell/core/src/config/`
- `shell/core/src/config/standardConfig.ts`
