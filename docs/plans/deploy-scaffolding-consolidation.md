# Plan: Deploy scaffolding consolidation

## Status

Implemented in stages. `@brains/deploy-templates` is now the canonical source for shared deploy templates, scripts, env-schema fragments, and reconciliation helpers. `@rizom/brain` and `@rizom/ops` still publish package-local deploy artifacts by copying/rendering from the canonical package at build/scaffold time.

## Problem

Deploy artifact templates were split across three packages with no canonical home:

- **`packages/brain-cli/templates/deploy/scripts/`** — `provision-server.ts`, `update-dns.ts`, `write-ssh-key.ts` (per-instance scaffolding scripts).
- **`packages/brain-cli/src/commands/init.ts`** — 1400+ lines that inline Dockerfile, `.kamal/secrets`, and the GitHub release workflow as string literals interleaved with scaffolding logic.
- **`@brains/utils/deploy-templates/`** — previously hosted the `kamal-deploy.yml` template imported by `init.ts` via `with { type: "text" }`.
- **`packages/brains-ops/templates/`** — fleet-operator templates (`rover-pilot/`) plus parallel bootstrap routines (cert, SSH key, age key, secrets, content repo provisioning).

Original effects:

- A change to the Kamal shape touched three packages.
- `init.ts` was the de-facto template authority but was hard to read because templates and orchestration were interleaved as string concatenation.
- `@rizom/brain` (single-instance scaffolding) and `@rizom/ops` (fleet ops) both published deploy-adjacent artifacts; the boundary between them was unclear, and both reached into shared `@brains/utils` for the Kamal yml.
- New deploy customizations had nowhere obvious to land.

## Goal

One canonical home for deploy artifact templates, consumed by both `brain init --deploy` (single-instance) and `brains-ops` (fleet). Keep instance vs. fleet semantics separate at the _command_ layer; share the template _content_.

## Design sketch

### Extract `@brains/deploy-templates`

A new shared package owns the template surface:

- Dockerfile (with and without site-builder)
- `.kamal/` config and hook scripts
- `kamal-deploy.yml` (moved out of `@brains/utils`)
- `deploy/scripts/{provision-server,update-dns,write-ssh-key,validate-secrets,write-kamal-secrets}.ts`
- the GitHub Actions release/deploy workflow yaml
- the env-schema _fragments_ CLI inlines (`deployProvisionEnvSchema`, `tlsCertEnvSchema`, `backendBootstrapEnvSchema`)

Public API: render functions, not raw strings.

```ts
import {
  renderKamalDeploy,
  renderDockerfile,
  deployScripts,
} from "@brains/deploy-templates";

const dockerfile = renderDockerfile();
```

Templates get rendered with explicit, typed inputs — not string concatenation in the caller.

### Slim `init.ts`

`brain init --deploy` calls `@brains/deploy-templates` for content; `init.ts` orchestrates which files land where, prompts the user, and writes the tree. Target: cut `init.ts` from 1400+ to under 700 lines.

### `@rizom/ops` keeps fleet-only concerns

Stays in `brains-ops`:

- per-user/per-fleet onboarding flows (`onboard-user`, `user-add`, `default-user-runner`)
- age-key bootstrap and encrypted secrets distribution
- the reconciliation loop (`reconcile-all`, `reconcile-cohort`)
- content-repo provisioning (`content-repo`)
- the `rover-pilot/` fleet scaffold

If `rover-pilot/` duplicates content from `@brains/deploy-templates`, replace the duplication with imports.

### What leaves `@brains/utils`

`@brains/utils/deploy-templates/` is currently a workaround for the import path. The new package can own the same `with { type: "text" }` import pattern; `@brains/utils` stops being a deploy-template host.

## Steps

1. [x] Inventory deploy template/string ownership across the three packages.
2. [x] Create `shared/deploy-templates/`; move `kamal-deploy.yml` and update consumers.
3. [x] Extract Dockerfile contents into `renderDockerfile()` and replace caller-local copies.
4. [x] Extract deploy scripts, GitHub workflows, pre-deploy hook, and helper script renderers.
5. [x] Move env-schema fragments (`deployProvisionEnvSchema`, `tlsCertEnvSchema`, `backendBootstrapEnvSchema`) into the new package; have `brain-cli/src/lib/env-schema.ts` import them.
6. [x] Audit `brains-ops/templates/rover-pilot/` for overlap; deduplicate shared Dockerfile, Kamal deploy config, deploy scripts, and pre-deploy hook against `@brains/deploy-templates`.
7. [x] Delete `@brains/utils/deploy-templates/`.

## Non-goals

- Merging `@rizom/brain` and `@rizom/ops`
- Changing the runtime contract between deploy artifacts and the brain at boot
- Re-templating Kamal config in a different DSL
- Moving fleet operator concerns out of `@rizom/ops`

## Verification

1. `brain init --deploy` output stays covered by init scaffold tests.
2. `init.ts` is below 700 lines.
3. `@brains/utils/deploy-templates/` no longer exists.
4. Adding a shared deploy artifact now starts in `@brains/deploy-templates`; published CLIs copy/render package-local artifacts for runtime availability.
5. `brains-ops` fleet-pilot scaffold remains covered by targeted init tests; live provisioned-instance verification is still recommended before operational rollout.

## Related

- `packages/brain-cli/src/commands/init.ts`
- `packages/brain-cli/templates/deploy/`
- `packages/brains-ops/templates/rover-pilot/`
- `shared/utils/src/deploy-templates/` (current Kamal home)
- `docs/plans/unified-http-surface.md` — adjacent Kamal/shared HTTP surface work
- `docs/plans/env-schema-canonical.md` — shares the env-schema-fragment touch points
