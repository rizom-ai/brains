---
"@rizom/brain": patch
---

Add an explicit `brain init --deploy --regen` path for standalone deploy scaffolds.

- regenerate derived deploy artifacts like `.github/workflows/deploy.yml`, `.github/workflows/publish-image.yml`, `.kamal/hooks/pre-deploy`, `deploy/Dockerfile`, and `deploy/Caddyfile`
- keep canonical instance files such as `brain.yaml`, `.env`, `.env.schema`, and `config/deploy.yml` untouched during regen
- re-derive the deploy workflow secret bridge from the current `.env.schema`, fixing drift after post-init schema changes
