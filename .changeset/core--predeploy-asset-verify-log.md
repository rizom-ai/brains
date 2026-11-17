---
"@brains/deploy-support": patch
"@rizom/ops": patch
"@rizom/brain": patch
---

The pre-deploy backup prints its asset verification in the deploy log: `pre-deploy snapshot assets: N referenced, N verified, N failed` after the verified snapshot line, and the same counts in the step summary. Every referenced asset is checked, not only up to the first bad one. When any fails, the log shows the counts reached and one error per failed asset, naming its digest, the entities that reference it (`type/id`) and why it failed, and the backup still blocks the deploy. `brain.db.asset-verify.json` records the same counts and failures. Regenerate `deploy/scripts/create-predeploy-backup.ts` in existing deployments to adopt it.
