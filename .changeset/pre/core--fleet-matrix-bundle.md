---
"@rizom/ops": patch
"@brains/contracts": patch
"@rizom/brain": patch
---

A fleet cohort can name the `matrix` bundle. The canonical bundle ids now live in one list in `@brains/contracts`, which the brain's model is pinned to by a test and the fleet's cohort schema reads, so a new bundle is named in one place. `brains-ops init` scaffolds `deploy/scripts/reload-homeserver.ts`.
