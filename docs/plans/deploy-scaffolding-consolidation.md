# Plan: Deploy scaffolding consolidation

## Status

Proposed.

## Problem

Deploy artifact templates are split across three packages with no canonical home:

- **`packages/brain-cli/templates/deploy/scripts/`** — `provision-server.ts`, `update-dns.ts`, `write-ssh-key.ts` (per-instance scaffolding scripts).
- **`packages/brain-cli/src/commands/init.ts`** — 1400+ lines that inline Caddyfile, Dockerfile, `.kamal/secrets`, and the GitHub release workflow as string literals interleaved with scaffolding logic.
- **`@brains/utils/deploy-templates/`** — the `kamal-deploy.yml` template, imported by `init.ts` via `with { type: "text" }` (`init.ts:13`).
- **`packages/brains-ops/templates/`** — fleet-operator templates (`rover-pilot/`) plus parallel bootstrap routines (cert, SSH key, age key, secrets, content repo provisioning).

Effects:

- A change to the Kamal shape touches three packages.
- `init.ts` is the de-facto template authority but is hard to read because templates and orchestration are interleaved as string concatenation.
- `@rizom/brain` (single-instance scaffolding) and `@rizom/ops` (fleet ops) both publish deploy-adjacent artifacts; the boundary between them is unclear, and both reach into shared `@brains/utils` for the Kamal yml.
- New deploy customizations have nowhere obvious to land.

## Goal

One canonical home for deploy artifact templates, consumed by both `brain init --deploy` (single-instance) and `brains-ops` (fleet). Keep instance vs. fleet semantics separate at the _command_ layer; share the template _content_.

## Design sketch

### Extract `@brains/deploy-templates`

A new shared package owns the template surface:

- Caddyfile (preview + production variants)
- Dockerfile (with and without site-builder)
- `.kamal/` config and hook scripts
- `kamal-deploy.yml` (moved out of `@brains/utils`)
- `deploy/scripts/{provision-server,update-dns,write-ssh-key}.ts`
- the GitHub Actions release workflow yaml
- the env-schema _fragments_ CLI inlines (`deployProvisionEnvSchema`, `tlsCertEnvSchema`, `backendBootstrapEnvSchema`)

Public API: render functions, not raw strings.

```ts
import {
  renderCaddyfile,
  renderKamalDeploy,
  renderDockerfile,
  deployScripts,
} from "@brains/deploy-templates";

const caddyfile = renderCaddyfile({ domain, preview: true });
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

1. Inventory: build a manifest of every deploy template/string across the three packages — file → owner → consumers.
2. Create `shared/deploy-templates/` skeleton; move `kamal-deploy.yml` first as the smallest cut. Update `init.ts` import path.
3. Extract Caddyfile contents into `renderCaddyfile()`. Replace the string literal in `init.ts` with the call. Diff scaffold output to confirm byte-identical.
4. Repeat for Dockerfile, `.kamal/secrets`, GitHub workflow, deploy scripts — one move per change.
5. Move env-schema fragments (`deployProvisionEnvSchema`, `tlsCertEnvSchema`, `backendBootstrapEnvSchema`) into the new package; have `brain-cli/src/lib/env-schema.ts` import them.
6. Audit `brains-ops/templates/rover-pilot/` for overlap; deduplicate against `@brains/deploy-templates`.
7. Delete `@brains/utils/deploy-templates/`.

## Non-goals

- Merging `@rizom/brain` and `@rizom/ops`
- Changing the runtime contract between deploy artifacts and the brain at boot
- Re-templating Caddy/Kamal config in a different DSL
- Moving fleet operator concerns out of `@rizom/ops`

## Verification

1. `brain init --deploy` output diffs to nothing against the pre-migration scaffold
2. `init.ts` drops below 700 lines
3. `@brains/utils/deploy-templates/` no longer exists
4. Adding a new deploy artifact touches one package, not three
5. `brains-ops` fleet-pilot scaffold still works against an actual provisioned instance

## Related

- `packages/brain-cli/src/commands/init.ts`
- `packages/brain-cli/templates/deploy/`
- `packages/brains-ops/templates/rover-pilot/`
- `shared/utils/src/deploy-templates/` (current Kamal home)
- `docs/plans/unified-http-surface.md` — adjacent Caddy/Kamal work
- `docs/plans/env-schema-canonical.md` — shares the env-schema-fragment touch points
