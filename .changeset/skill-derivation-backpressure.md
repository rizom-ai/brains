---
"@brains/agent-discovery": patch
"@brains/topics": patch
"@brains/core": patch
---

Run initial topic and skill derivation through the job queue instead of doing heavy work inline during startup. Skill replace-all is now diff-based, unchanged skills are no longer deleted/recreated, and stale skill deletes run sequentially to avoid init-time mutation fanout and embedding-job storms. Initial topic/skill bootstrap derivation now skips when persisted derived entities already exist. Standard state database paths now honor `XDG_DATA_HOME` so container `/data` mounts are used by default.
