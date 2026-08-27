---
"@brains/conversation-memory": minor
"@brains/conversation-service": minor
"@brains/plugins": minor
"@brains/core": minor
"@brains/sdk": minor
"@brains/test-utils": patch
"@rizom/brain": minor
---

Restart automatic conversation memory on the scheduler-owned projection graph.

Conversation changes now use a durable composite cursor with transactional,
strictly monotonic revisions. Fresh activation establishes a no-backfill
baseline, while an admin-only confirmed system tool runs historical projection
with an independent durable cursor.

Projection input selection now receives configured conversation spaces, and
target authority adds `managed` reconciliation for explicitly partitioned
deletes. Additive rules reject delete intents.

Conversation memory derives summaries from changed eligible conversations,
carries a hidden versioned downstream envelope, and reconciles first-class
decisions and action items without additional model calls.
