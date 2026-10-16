---
"@rizom/brain": patch
---

Run all network Git operations (pull, push, ls-remote, clone) through Bun-owned, process-group-scoped children with stall timeouts, guaranteed reaping, and credential-redacted errors — so large directory imports cannot leave unreaped Git processes or deadlock the web runtime.
