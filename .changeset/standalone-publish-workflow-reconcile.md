---
"@rizom/brain": patch
---

Broaden standalone publish workflow reconciliation so `brain init --deploy` upgrades older extracted `publish-image.yml` files to target the standalone Docker stage instead of leaving stale image builds behind.
