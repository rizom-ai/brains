# Operator Playbook

## Deploy contract files

Treat these as checked-in deploy artifacts in the pilot repo:

- `.env.schema`
- `deploy/kamal/deploy.yml`
- `deploy/scripts/`
- `.github/workflows/build.yml`
- `.github/workflows/deploy.yml`
- `.github/workflows/reconcile.yml`

`.env.schema` is the single source of truth for required and sensitive deploy vars.
The deploy scripts and workflows should read from that contract instead of inventing a second list.

The shared pilot image tag is `brain-${brainVersion}`:

- build publishes `brain-${brainVersion}`
- generated `users/<handle>/.env` carries `BRAIN_VERSION=<brainVersion>`
- deploy sets `VERSION=brain-${brainVersion}`

## Version bump flow

When `pilot.yaml.brainVersion` changes and you push:

1. build publishes the new shared image tag
2. reconcile refreshes generated `users/<handle>/.env`
3. deploy runs for handles whose generated config changed
4. generated file commits happen once in a final aggregation step after the deploy matrix finishes

When a push changes only deploy contract files and no generated `users/<handle>/.env` or `users/<handle>/brain.yaml` files, the deploy workflow exits through its explicit no-op path and prints `No affected user configs; skipping deploy.`

They are scaffolded from `@rizom/ops`, then versioned in this repo like any other deploy contract.

## Upgrading operator behavior

When `@rizom/ops` changes the scaffolded deploy contract:

1. bump `@rizom/ops` in `package.json`
2. rerun the relevant scaffold/reconcile flow
3. review the resulting changes to `.env.schema`, `deploy/scripts/`, and workflows in git
4. commit the updated deploy artifacts together

## Recovery notes

Document known failure modes, recovery steps, and operator notes here.
