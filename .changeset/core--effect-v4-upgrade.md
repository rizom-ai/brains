---
"@brains/utils": patch
"@rizom/brain": patch
---

Upgrade the private Effect control-plane boundary to exactly 4.0.1, migrate service layers and supervised work to v4 APIs, and retain Promise-based public contracts and AbortSignal cancellation. Centralize optional clock injection and add regressions for failure identity, resource ownership, cleanup barriers, and deterministic timing.
