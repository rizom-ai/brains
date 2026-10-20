---
"@rizom/brain": patch
"@rizom/ops": patch
---

The pre-deploy backup verifies the image assets in its `brain.db` snapshot: every referenced asset must have a published header whose chunks run contiguously, add up to its size and hash to its digest, or the backup fails and blocks the deploy. The asset count, total bytes, digest inventory and orphan uploads are recorded beside the snapshot. Regenerate `deploy/scripts/create-predeploy-backup.ts` in existing deployments to adopt it.
