# rover-pilot

Private desired-state repo for the rover pilot.

This is a single operator-owned repo. Pilot users do not get their own brain repos.
Per-user deploy config lives under `users/<handle>/`, while content stays in per-user content repos.

## Commands

- `brains-ops init <repo>`
- `brains-ops render <repo>`
- `brains-ops onboard <repo> <handle>`
- `brains-ops reconcile-cohort <repo> <cohort>`
- `brains-ops reconcile-all <repo>`
