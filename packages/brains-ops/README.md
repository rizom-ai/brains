# brains-ops

Private operator CLI for managing pilot brain fleet registry repos.

## Commands

- `brains-ops init <repo>`
- `brains-ops render <repo>`
- `brains-ops onboard <repo> <handle>` — requires an injected operator runner
- `brains-ops reconcile-cohort <repo> <cohort>` — requires an injected operator runner
- `brains-ops reconcile-all <repo>` — requires an injected operator runner

## Scope

`brains-ops` lives in the `brains` monorepo.

It operates on a separate private data repo, such as `rover-pilot/`, which stores:

- `pilot.yaml`
- `users/*.yaml`
- `cohorts/*.yaml`
- generated `views/users.md`
- per-user snapshots under `users/<handle>/brain.yaml`
