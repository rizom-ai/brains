# brains-ops

Private operator CLI for managing pilot brain fleet registry repos.

## Commands

- `brains-ops init <repo>`
- `brains-ops render <repo>`
- `brains-ops onboard <repo> <handle>`
- `brains-ops reconcile-cohort <repo> <cohort>`
- `brains-ops reconcile-all <repo>`

## Scope

`brains-ops` lives in the `brains` monorepo.

It operates on a separate private data repo, such as `rover-pilot/`, which stores:

- `pilot.yaml`
- `users/*.yaml`
- `cohorts/*.yaml`
- generated `views/users.md`
- generated per-user config under `users/<handle>/brain.yaml`
- generated per-user env selectors under `users/<handle>/.env`
