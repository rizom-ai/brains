---
"@rizom/brain": patch
---

Broaden standalone deploy Dockerfile reconciliation so `brain init --deploy` upgrades older Caddy-based Dockerfiles even when the generated header drifted slightly, instead of leaving a stale Dockerfile behind after removing `deploy/Caddyfile`.
