---
"@rizom/brain": patch
"@rizom/ops": patch
---

A successful pre-deploy backup now shows the runtime's own notices, such as the degraded checks it backed up anyway, as workflow warnings. Before, the remote output of a successful capture was discarded. Regenerate `deploy/scripts/create-predeploy-backup.ts` in existing deployments to adopt it.
