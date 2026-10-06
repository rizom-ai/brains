---
"@rizom/brain": patch
"@rizom/ops": patch
---

The pre-deploy backup verifies embedding databases whether or not they still carry the retired libSQL vector index. Before, it read the index's shadow table unconditionally and failed once the index was dropped. Regenerate `deploy/scripts/create-predeploy-backup.ts` in existing deployments to adopt it.
