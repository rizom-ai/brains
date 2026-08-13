---
"@rizom/brain": patch
"@rizom/ops": patch
---

Make stalled background work visible and recoverable: expose durable worker and due-queue status, persist configured worker-session expiry, fail the runtime after worker restart-budget exhaustion, persist bounded generation-linked projection incidents, and require operational health in post-deploy verification and fleet status.
