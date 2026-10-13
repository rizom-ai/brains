---
"@rizom/brain": patch
---

Share the shell's plugin AI namespace between entity and service contexts, and give the scoped service layers (entity-service, job-queue, conversation-service, runtime-state) one `scopedServiceLayer` helper instead of four hand-built acquire/release nestings.
