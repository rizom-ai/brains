---
"@rizom/brain": patch
---

Changes the worker makes, such as content synced from git, now reach every plugin that follows entity changes: site metadata, publish preflight, playbook evidence, AT Protocol projections and the brain card, and the git export. FAQ reconciles where the embedding was made. Plugins can no longer subscribe to entity or embedding events in one process only.
