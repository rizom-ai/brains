---
"@rizom/brain": patch
"@rizom/ops": patch
---

The pre-deploy backup no longer refuses a runtime whose plugins report degraded health. It still requires a ready runtime with an idle job queue, names the degraded checks in the deploy log and backs the runtime up, because a deploy is often the fix for what a plugin reports. A refusal now states its reason (runtime not ready, job queue not idle) instead of exiting silently. Regenerate `deploy/scripts/create-predeploy-backup.ts` in existing deployments to adopt it.
