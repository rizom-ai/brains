# Plan: Standalone App Repos

Last updated: 2026-04-26

This file is now a compatibility pointer.

Canonical planning for current Rizom site follow-through lives in:

- `docs/plans/rizom-site-composition.md`

Current shape:

- the Rizom site family has been simplified into a shared `sites/rizom` core plus app-local `src/site.ts` ownership in the standalone app repos
- `shared/theme-rizom` remains the shared family theme in `brains`
- a separate `rizom-sites` repo is not the active target; only reconsider it if a concrete extraction need appears later

Use `docs/plans/rizom-site-composition.md` for:

- Rizom package ownership boundaries
- the shared-site + app-local-variant contract
- app-repo validation criteria
- remaining product/content follow-through
