---
"@rizom/brain": patch
---

Guest chat sessions no longer stay refused after a release changes their limits. The session ledger adopts new limits only through an explicit owner action, and nothing ever took it, so after the preset change every visitor saw "Chat isn't available" even with guest chat switched on. Switching on in Studio (or reopening through the activation endpoint) now adopts the session limits too, and at startup a deployment whose owner authorized exactly the current policy brings its session ledger to that policy's limits.
