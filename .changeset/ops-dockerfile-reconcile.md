---
"@rizom/ops": patch
---

Broaden rover-pilot deploy Dockerfile reconciliation so `brains-ops init` upgrades older Caddy-based Dockerfiles even when packaged runtime formatting drift would otherwise prevent an exact legacy-content match.
