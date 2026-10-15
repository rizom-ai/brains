---
"@rizom/brain": patch
---

When a Git pull is interrupted, a startup that later fails during inherited-work reconciliation or Git initialization now records the recovery as failed, as connect, startup replay, and initial-sync failures already did. Before this fix, sync status kept showing a `pulling` run while directory sync was disabled.
