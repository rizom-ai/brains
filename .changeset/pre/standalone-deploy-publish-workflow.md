---
"@rizom/brain": patch
---

Improve standalone deploy scaffolding for real repo usage.

- scaffold a repo-local `publish-image.yml` workflow for standalone repos
- make standalone deploy workflows trigger from `Publish Image` and deploy immutable SHA tags instead of relying on `latest`
- switch standalone `config/deploy.yml` image identity from hardcoded `rizom-ai/<model>` values to repo-derived placeholders
- scaffold repo-local deploy image assets (`deploy/Dockerfile`, `deploy/Caddyfile`)
- bundle built-in model env schemas into the published package so `brain init --deploy` works outside the monorepo
- reconcile known stale generated deploy files in existing standalone repos without overwriting custom edits
