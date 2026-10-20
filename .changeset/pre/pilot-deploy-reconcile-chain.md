---
"@rizom/ops": patch
---

Fix the rover-pilot deploy scaffold so deploys can run after Reconcile-generated config commits. The generated Deploy workflow now listens for successful Reconcile runs on `main`, the generated handle resolver supports `workflow_run` events, and rerunning `brains-ops init` upgrades older pilot repos that still have the stale pre-fix workflow and resolver templates.
