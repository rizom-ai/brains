---
"@brains/directory-sync": patch
---

Own directory watcher startup and shutdown with a private Effect scope, start auto-sync watching from plugin ready, and await Chokidar closure plus active file callbacks during teardown.
