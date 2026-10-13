---
"@brains/core": patch
"@rizom/brain": patch
---

Remove the obsolete Effect v3 Promise-failure wrapper and use Effect v4's native Promise runner for shell, daemon, and job-runtime ownership. Preserve original failure values, all-siblings-settled startup phases, declaration-order failure selection, and shared cleanup barriers for concurrent shutdown callers.
