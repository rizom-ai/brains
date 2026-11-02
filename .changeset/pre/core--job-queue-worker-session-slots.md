---
"@brains/job-queue": patch
"@rizom/brain": patch
---

Redeploying the same brain version no longer cuts off the old container's in-flight jobs. Both containers' workers shared one worker slot, so the new worker superseded the old one's session: its running jobs became reclaimable and it exited unhealthy. Every worker session now holds its own slot; of the live workers of one version, only the newest takes new work, while the older one keeps its session and finishes what it holds. A crashed worker's session is removed once it has been expired for longer than its timeout and none of its jobs holds a live lease, so it no longer stays behind as a stale session.
