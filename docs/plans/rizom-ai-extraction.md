# Rizom App Extraction — Open Items

## Current shape

The apps-only extraction target is complete:

- `rizom.ai` lives in its standalone repo.
- `rizom.foundation` lives in its standalone repo.
- `rizom.work` lives in its standalone repo.
- Shared Rizom site/theme/runtime code stays in `brains`.
- App repos consume published packages (`@rizom/brain`, `@rizom/ui`) instead of workspace-local app packages.

## Open items

- Keep standalone app dependencies pinned to current published `@rizom/brain` and `@rizom/ui` versions.
- For each app repo change, validate with:
  - install
  - typecheck
  - app start
  - remote preview rebuild against the running app
  - generated preview inspection
- Keep content repo linkage documented in each app repo README.
- Keep deploy/env secret expectations documented in each app repo `.env.schema` / README.
- Remove or update stale references in `brains` docs that still point at `apps/rizom-*` as deployable app boundaries.

## Guardrails

- Do not extract `sites/rizom` into a separate `rizom-sites` repo.
- Do not duplicate `sites/rizom` or `shared/theme-rizom` into app repos.
- Do not reintroduce monorepo deploy app packages for Rizom sites.
