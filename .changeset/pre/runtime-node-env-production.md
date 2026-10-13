---
"@rizom/brain": patch
---

Read `NODE_ENV` at container runtime instead of Bun bundle time so hosted deployments prefer public URLs when `NODE_ENV=production` is supplied by deploy configuration.
