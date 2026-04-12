# rover-pilot

Private desired-state repo for the rover pilot.

This is a single operator-owned repo. Pilot users do not get their own brain repos.
Per-user deploy config lives under `users/<handle>/`, while content stays in per-user content repos.

## Operator tooling

This repo pins `@rizom/ops` in `package.json`.

Install it with:

```sh
bun install
```

Then run commands with:

```sh
bunx brains-ops <command>
```

The repo also checks in its deploy contract:

- `.env.schema`
- `deploy/kamal/deploy.yml`
- `deploy/scripts/`
- `.github/workflows/*`

`.env.schema` is the single source of truth for required and sensitive deploy vars.
The shared pilot image tag is `brain-${brainVersion}` end to end.
When `pilot.yaml.brainVersion` changes and you push, CI rebuilds the shared tag, refreshes generated user env files, and redeploys affected users.
When a push changes only deploy contract files, CI prints `No affected user configs; skipping deploy.` and stops before Kamal.

## Commands

- `brains-ops init <repo>`
- `brains-ops render <repo>`
- `brains-ops onboard <repo> <handle>`
- `brains-ops secrets:push <repo> <handle>`
- `brains-ops reconcile-cohort <repo> <cohort>`
- `brains-ops reconcile-all <repo>`
