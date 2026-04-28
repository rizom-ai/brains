# Plan: Canonical env schema

## Status

Proposed.

## Problem

Brain instances declare environment via a `.env.schema` file generated at `brain init`. The shell expects matching env at runtime. There is no shared canonical source.

- `packages/brain-cli/src/lib/env-schema.ts:160-175` (`buildInstanceEnvSchema`) composes the schema from inlined string fragments: `deployProvisionEnvSchema`, `tlsCertEnvSchema`, `backendBootstrapEnvSchema`, plus a model-specific schema resolved from `packages/brain-cli/src/lib/generated/bundled-model-env-schemas.ts`.
- The shell reads env at runtime through `shell/core/src/config/` and individual services (ai-service, directory-sync, embedding-service, etc.).
- A test (`packages/brain-cli/src/lib/env-schema.test.ts`) keeps the CLI side internally honest, but does not assert against actual shell expectations.

Adding a new env var the shell needs requires editing both the CLI's bundled schema (so `brain init` scaffolds it) and the shell service that reads it. Drift is silent: forget the CLI side and the operator gets a useless `.env.schema`; forget the shell side and the var is never read.

## Goal

A single source of truth for shell-consumed env vars, declared next to the service that reads them, aggregated by `shell/core`, and consumed verbatim by `brain-cli` for `init`.

## Design sketch

### Co-located declarations

Each shell-side service that consumes env declares its vars next to where they're read:

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

Aggregate at `shell/core`:

```ts
// shell/core/src/env-schema.ts
import { aiServiceEnvSchema } from "@brains/ai-service/env-schema";
import { directorySyncEnvSchema } from "@brains/directory-sync/env-schema";
// ...

export function shellEnvVars(model: string): EnvVarDecl[] { ... }
```

The function takes `model` because preset composition determines which services are actually wired in for a given brain.

### CLI consumes the canonical function

`brain-cli/src/lib/env-schema.ts` imports `shellEnvVars()` and renders it to varlock-flavored `.env.schema` format. The deploy/TLS/backend-bootstrap fragments stay where they are — those are CLI-owned scaffolding vars the shell never reads.

### Runtime asserts on it

Each service's config reads env via the same declarations, so a missing or misnamed var fails fast at startup with a pointer to the canonical schema rather than as a generic "undefined" deep in service code.

### The boundary

- shell-owned: app env vars consumed by shell services (AI keys, sync settings, DB paths, secrets that flow into runtime config)
- CLI-owned: scaffolding env vars never read by the shell (`HCLOUD_TOKEN`, TLS cert vars, varlock backend-bootstrap)

The CLI assembles both halves; the shell only needs its half.

## Steps

1. Pick one service as the pilot — `ai-service` is a good first candidate (small surface, broadly used). Move its env declarations into a co-located schema file. Have its config builder consume the schema.
2. Add `shell/core/src/env-schema.ts` aggregator with just that one service.
3. Update `brain-cli/src/lib/env-schema.ts` to call `shellEnvVars()` for the model-specific section, replacing `bundled-model-env-schemas` for that service's portion.
4. Migrate remaining services one at a time.
5. Remove `bundled-model-env-schemas.ts` once all services are migrated.
6. Tighten `env-schema.test.ts` to assert generated `.env.schema` matches `shellEnvVars()` output.

## Non-goals

- Changing the `.env.schema` file format or varlock annotations
- Changing how operators set env in production (CI secrets, secret backends)
- Validating env at runtime beyond what services already do

## Verification

1. Adding a new env var to a service requires only one edit (in the service's schema file)
2. `brain init` scaffolds that var without touching `brain-cli/src/lib/env-schema.ts`
3. `bundled-model-env-schemas.ts` no longer exists
4. `env-schema.test.ts` fails when shell schema and CLI output drift

## Related

- `packages/brain-cli/src/lib/env-schema.ts`
- `packages/brain-cli/src/lib/generated/bundled-model-env-schemas.ts`
- `shell/core/src/config/`
