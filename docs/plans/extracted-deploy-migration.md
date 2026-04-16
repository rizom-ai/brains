# Plan: Migrate extracted deployments to the shared HTTP host

## Status

Draft.

## Scope

This plan covers the currently extracted deployment repos outside the monorepo:

- `~/Documents/yeehaa-io`
- `~/Documents/mylittlephoney`
- `~/Documents/rover-pilot`

Goal: move them onto the post-Caddy deploy model that matches the current monorepo implementation:

- shared app-owned HTTP host
- `app_port: 8080`
- no in-container `Caddyfile`
- app starts directly with `brain start`
- preview routing handled in app by `Host`

## Summary

All three existing extracted deployments still need deploy-scaffold work before migration.

The blocker is not the app-level `brain.yaml` shape. The blocker is the checked-in and installed deploy scaffold shape:

- old Kamal app port (`80`)
- old in-container Caddy runtime
- old internal fan-out to `3333` / `3334` / `3335`
- old preview routing assumptions

## Inventory

### `~/Documents/yeehaa-io`

Needs work: **yes**.

Observed deploy shape:

- `config/deploy.yml` still uses `app_port: 80`
- `deploy/Dockerfile` still installs and starts Caddy
- `deploy/Caddyfile` still proxies old split surfaces
- installed package template under `node_modules/@rizom/brain/templates/deploy/*` is also still on the old shape

Implication:

- re-running the current locally installed package will not pick up the new deploy scaffold
- either upgrade to a new published `@rizom/brain`, or manually sync deploy assets from the monorepo

### `~/Documents/mylittlephoney`

Needs work: **yes**.

Observed deploy shape:

- `config/deploy.yml` still uses `app_port: 80`
- `deploy/Dockerfile` still installs and starts Caddy
- `deploy/Caddyfile` still proxies old split surfaces
- installed package template under `node_modules/@rizom/brain/templates/deploy/*` is also still on the old shape

Implication:

- same as `yeehaa-io`, but with an even older pinned `@rizom/brain` version
- upgrade first, then regenerate or manually sync deploy assets

### `~/Documents/rover-pilot`

Needs work: **yes**.

Observed deploy shape:

- `deploy/kamal/deploy.yml` still uses `app_port: 80`
- `deploy/Dockerfile` still installs and starts Caddy
- `deploy/Caddyfile` is still present and active
- installed package template under `node_modules/@rizom/ops/templates/rover-pilot/*` is still on the old shape

Important nuance:

- the checked user brain configs (`users/max/brain.yaml`, `users/smoke/brain.yaml`) are not the main migration problem
- the shared fleet deploy scaffold is the migration problem

Implication:

- rerunning a new enough `brains-ops init` can now reconcile the known stale generated deploy scaffold
- then canary and roll forward per-user deploys

## Would running `init` fix this?

### Standalone apps: `yeehaa-io` and `mylittlephoney`

Short answer: **mostly yes, but not by itself**.

`brain init --deploy` helps, but is not sufficient by itself.

It can reconcile some known generated files, but only if:

1. the repo is using a new enough published `@rizom/brain`
2. the file is one `brain init` knows how to update
3. the existing file matches a known legacy generated artifact, or `--regen` is used

Important limits:

- `brain init` without `--regen` does not force-rewrite every existing generated file
- even with `--regen`, `brain init` does not clean up removed files like `deploy/Caddyfile`

So for standalone repos the practical rule is:

> upgrade `@rizom/brain`, run `brain init . --deploy --regen`, then manually remove stale removed files and review the diff

### Fleet repo: `rover-pilot`

Short answer: **yes, for the known stale generated deploy artifacts**.

`brains-ops init` now reconciles the known stale generated rover-pilot deploy scaffold:

- `deploy/kamal/deploy.yml`
- `deploy/Dockerfile`
- generated legacy `deploy/Caddyfile` removal

It still preserves custom files that do not match the known generated legacy content.

So for rover-pilot the practical rule is:

> upgrade to a new enough `@rizom/ops`, rerun `brains-ops init` on the existing repo, review the diff, and only fall back to a fresh reference scaffold if the repo has drifted beyond the known generated legacy shapes

## Preconditions

Before touching the extracted repos:

1. publish the new `@rizom/brain`
2. publish the new `@rizom/ops`
3. verify the published templates contain the post-Caddy deploy shape

Expected published template shape:

- no `deploy/Caddyfile`
- `app_port: 8080`
- Dockerfile does not install Caddy
- Dockerfile starts app directly with `brain start`
- preview host routing handled by the app

## Migration plan

### Phase 1 — Standalone canary: `mylittlephoney`

1. Create a branch and snapshot current deploy artifacts.
2. Upgrade `@rizom/brain` to the new published version.
3. Run:

   ```bash
   bun install
   bunx brain init . --deploy --regen
   ```

4. Delete stale removed file if still present:

   ```bash
   rm -f deploy/Caddyfile
   ```

5. Review the generated diff.
6. Deploy.
7. Verify:
   - main site
   - preview host
   - `/health`
   - `/mcp`
   - `/.well-known/agent-card.json` if A2A is enabled
   - `/a2a` if A2A is enabled

### Phase 2 — Standalone app: `yeehaa-io`

Repeat the same sequence used for `mylittlephoney`:

1. upgrade `@rizom/brain`
2. run `bun install`
3. run `bunx brain init . --deploy --regen`
4. remove stale `deploy/Caddyfile` if present
5. review diff
6. deploy
7. verify site, preview, `/health`, `/mcp`, and A2A routes

### Phase 3 — Fleet scaffold: `rover-pilot`

1. Upgrade `@rizom/ops` to the new published version.
2. Rerun init on the existing repo:

   ```bash
   bun install
   bunx brains-ops init .
   ```

3. Review the generated diff.
   - expected updates include `deploy/kamal/deploy.yml` and `deploy/Dockerfile`
   - expected cleanup includes generated legacy `deploy/Caddyfile` removal
4. If the repo has drifted beyond the known generated legacy shapes, fall back to a fresh temporary scaffold from the new release and copy the generated deploy artifacts over.
5. Review any rover-pilot-specific local customizations before committing.
6. Canary deploy a low-risk user first.

Recommended canary order:

1. `smoke`
2. `max`
3. broader fleet rollout

4. Verify per-user behavior:
   - site or root response shape
   - preview host
   - `/health`
   - `/mcp`
   - expected MCP auth behavior

## Verification checklist

For each migrated deployment, confirm:

- deploy config points at `app_port: 8080`
- no active `deploy/Caddyfile`
- Dockerfile does not install or start Caddy
- app starts directly with `brain start`
- main host serves correctly
- preview host serves correctly
- `/health` works on the shared host
- `/mcp` works on the shared host
- if enabled, `/.well-known/agent-card.json` works on the shared host
- if enabled, `/a2a` works on the shared host

## Rollout order

Recommended order:

1. release `@rizom/brain` and `@rizom/ops`
2. migrate `mylittlephoney`
3. migrate `yeehaa-io`
4. update `rover-pilot` shared scaffold
5. deploy `rover-pilot` canary user (`smoke`)
6. roll forward the remaining rover-pilot users

## Risks

- running `init` from an old installed package will regenerate the old scaffold again
- `brain init --deploy --regen` can update generated files, but does not automatically remove deleted legacy files
- `brains-ops init` now reconciles the known stale generated rover-pilot deploy scaffold, but not arbitrary custom drift
- rover-pilot workflow and script updates should be copied as a coherent set to avoid mixed old/new deploy behavior

## Decision

We should **not** migrate the extracted deployments from their current installed package versions.

The safe path is:

1. release new packages
2. upgrade extracted repos to those packages
3. regenerate or sync deploy assets
4. remove stale Caddy-era files
5. deploy and verify
