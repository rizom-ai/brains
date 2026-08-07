---
"@brains/core": patch
"@brains/job-queue": patch
"@rizom/brain": patch
---

Serialize durable job deduplication in explicit database write transactions across queue clients and processes. Validate duplicate requests before selection, reserve projection budget only for committed inserts, and preserve in-flight enqueue transactions during service shutdown.
