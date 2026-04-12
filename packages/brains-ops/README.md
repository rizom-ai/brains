# brains-ops

Operator CLI package for managing pilot brain fleet registry repos.

## Commands

- `brains-ops init <repo>`
- `brains-ops render <repo>`
- `brains-ops onboard <repo> <handle>`
- `brains-ops secrets:push <repo> <handle>`
- `brains-ops reconcile-cohort <repo> <cohort>`
- `brains-ops reconcile-all <repo>`

## Scope

`brains-ops` lives in the `brains` monorepo and is consumed as a separate package.

It operates on a separate private data repo, such as `rover-pilot/`, which stores:

- `pilot.yaml`
- `users/*.yaml`
- `cohorts/*.yaml`
- generated `views/users.md`
- generated per-user config under `users/<handle>/brain.yaml`
- generated per-user env selectors under `users/<handle>/.env`
