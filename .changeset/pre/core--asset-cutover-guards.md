---
"@rizom/brain": patch
---

A running brain now keeps a lease in `brain.db`, renewed every 10 seconds and deleted on a clean stop. `brain assets:migrate`, `assets:reconcile` and `assets:verify` refuse while any lease is fresh, which works across containers that share the data volume, and they name the process and host holding it. A lease a crash left also refuses unless you pass `--ignore-stale-heartbeat`; a fresh lease refuses even with that flag. The `/proc` check stays as a second layer. While a migrate or reconcile run writes, it holds its own lease, and a brain that starts during the run fails with an error naming the command, so the restart is retried after the run instead of serving a half-converted database.

`system_status` now reports, for trusted and admin callers, how often each read surface still turned an asset reference back into a data URL, by entity type, with when that was first and last seen. The counts never include ids or content. They are kept in runtime state, add up across the web and worker processes and survive restarts.
