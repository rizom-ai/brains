---
title: "Rizom Site Composition Plan"
section: "Planning and release readiness"
order: 250
sourcePath: "docs/plans/rizom-site-composition.md"
slug: "rizom-site-composition"
description: "The architecture/extraction work is done for the current target:"
---

# Rizom Site Composition — Open Items

## Current shape

The architecture/extraction work is done for the current target:

- `sites/rizom` stays in `brains` as the shared Rizom site core.
- `shared/theme-rizom` stays in `brains` as the shared family theme.
- `rizom.ai`, `rizom.foundation`, and `rizom.work` live in standalone app repos.
- App-specific composition, copy wiring, and local theme overrides live in those app repos.
- Shared packages are consumed through published runtime/UI packages, not workspace-only app packages.

## Open items

- Keep `@rizom/brain` and `@rizom/ui` release/pinning aligned across the extracted app repos.
- Validate app repo changes with the running-app flow: install, typecheck, start, remote preview rebuild, inspect generated preview output.
- Keep `sites/rizom` and `shared/theme-rizom` single-sourced in `brains`; do not copy them into app repos.
- Keep product/content polish in the app or content repos, not in new monorepo app packages.
- Remove any remaining docs or scripts that still imply `apps/rizom-*` is the active deploy boundary.

## Guardrails

- Do not reintroduce a parameterized `sites/rizom` base for per-app variation.
- Do not create a combined `rizom-sites` repo.
- Do not duplicate the shared Rizom site/theme layer into each app repo.
- Do not add deployable Rizom app packages back under `apps/`.

## Related

- `docs/plans/rizom-site-tbd.md`
