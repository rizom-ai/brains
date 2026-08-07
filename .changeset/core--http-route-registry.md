---
"@rizom/brain": patch
---

Finalize plugin HTTP routes into one immutable, collision-checked shell registry before the shared webserver starts. Preserve existing handler and tool precedence while rejecting malformed or reserved routes, avoiding per-request getter traversal, and failing closed before non-public tool routes execute. Remove the unused standalone API server so all routes continue through the shared host. Remove the aggregate `/health` endpoint after migrating probes to `/health/ready`; operational app metadata is now reported by `/health/operate`.
