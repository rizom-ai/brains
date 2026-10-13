---
"@rizom/brain": patch
---

`brain start` boots in the instance directory even when launched from elsewhere with `INIT_CWD`, as the dev start scripts do. The supervising process ran migrations against `./data` relative to where it was launched while its web and worker processes opened the instance's own `data/`, so a fresh instance failed to start (`Unable to open connection to local database ./data/runtime-state.db`) and an existing one ran on unmigrated stores.
