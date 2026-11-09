---
"@brains/core": patch
"@brains/entity-service": patch
"@rizom/brain": patch
---

A brain whose plugin set changed while a projection wave was still running now starts. Before, the next boot failed with `Projection wave "…" graph fingerprint does not match the finalized graph` and the web process exited before it was ready. The unfinished wave is now superseded: its inputs go back to the pending queue and a fresh wave plans them against the new plugin set. Jobs the old wave had queued for a removed plugin's rules finish as superseded instead of failing through their retries, including a job that a worker on the new plugin set picks up before any sweep has superseded the wave: that job supersedes the wave itself. In a brain with separate web and worker processes, the projection sweep no longer logs `Cannot claim projection wave while "…" is running` when the other process claimed the next wave first; it leaves that wave to the process that claimed it.
