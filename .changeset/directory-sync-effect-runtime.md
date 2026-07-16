---
"@brains/directory-sync": patch
---

Own watcher, periodic Git, auto-commit, and import-job polling lifecycle with private Effect scopes and schedules. Start background work from plugin ready, interrupt pending debounce work, abort periodic Git network operations, and await Chokidar callbacks plus active repository mutations during teardown.
