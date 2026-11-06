---
"@rizom/brain": patch
"@rizom/ops": patch
---

The predeploy backup waits for the running brain instead of failing on its database lock: every snapshot read opens with a busy timeout, so a writer's lock or a WAL recovery in progress delays the copy rather than aborting the deploy.
