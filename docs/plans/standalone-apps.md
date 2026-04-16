# Plan: Standalone App Repos

This file is now a compatibility pointer.

Canonical planning for current Rizom site follow-through lives in:

- `docs/plans/rizom-site-composition.md`

Current direction:

- first simplify the Rizom site family into a shared `sites/rizom` core plus app-local `src/site.ts` ownership
- only reconsider a separate `rizom-sites` repo after that smaller shape exists and there is a concrete reason to extract

Use `docs/plans/rizom-site-composition.md` for:

- Rizom package ownership boundaries
- the shared-site + app-local-variant target shape
- refactor order
- later extraction criteria
- verification criteria
