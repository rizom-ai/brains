---
"@rizom/brain": patch
---

A `brain` CLI that carries the bundled definition boots it, inside the monorepo too: `start`, `tool` and the command listing no longer hand off to the source runner when the bundled runtime is present, so a running brain is always the one module graph a deployment runs, with the same supervised web and worker processes. The test-app posture scripts (`start:minimal|personal|publishing|team|unified-inbox`) build once and run the bundled CLI from the app's own directory, so its `.env` loads as a deployed brain's does.
